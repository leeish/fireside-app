import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/crypto'
import { getAIClient, logTokenUsage } from '@/lib/ai'
import { generateEmbedding } from '@/lib/embeddings'
import { mergeExtraction, normalizeGraph, emptyGraph, findEntryGaps, type ExtractionResult, type NarrativeGraph } from '@/lib/graph'
import { ENTRY_EXTRACTION_SYSTEM } from '@/lib/extraction'
import { autoGenerateStory } from '@/lib/story'

type EnrichEntryEvent = { data: { turnId: string } }

export const enrichEntry = inngest.createFunction(
  { id: 'enrich-entry', retries: 3, triggers: [{ event: 'fireside/entry.enrich' }] },
  async ({ event }: { event: EnrichEntryEvent }) => {
    const { turnId } = event.data
    const supabase = createServiceClient()

    // Load the user's turn
    const { data: turn, error: turnError } = await supabase
      .from('turns')
      .select('id, conversation_id, user_id, role, content, processed')
      .eq('id', turnId)
      .single()

    if (turnError || !turn) throw new Error(`Turn not found: ${turnId}`)
    if (turn.role !== 'user') throw new Error(`Turn ${turnId} is not a user turn`)
    if (turn.processed) return { skipped: 'already processed' }

    // Get the question (most recent biographer turn in this conversation)
    const { data: bioTurns } = await supabase
      .from('turns')
      .select('content')
      .eq('conversation_id', turn.conversation_id)
      .eq('role', 'biographer')
      .order('created_at', { ascending: false })
      .limit(1)

    const questionText = bioTurns?.[0]?.content
      ? decrypt(bioTurns[0].content, process.env.MEMORY_ENCRYPTION_KEY!)
      : ''

    // Decrypt the user's response
    const responseText = decrypt(turn.content, process.env.MEMORY_ENCRYPTION_KEY!)

    // Run extraction pass
    const { client, model } = getAIClient()

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      store: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ENTRY_EXTRACTION_SYSTEM },
        { role: 'user', content: `Question asked: ${questionText}\n\nUser's response: ${responseText}` },
      ],
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const extraction: ExtractionResult = JSON.parse(raw)

    await logTokenUsage(supabase, {
      userId: turn.user_id,
      conversationId: turn.conversation_id,
      inngestFunction: 'enrich-entry',
      model,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      purpose: 'entry extraction',
    })

    // Load or initialize the user's narrative graph
    const { data: narrativeRow } = await supabase
      .from('narratives')
      .select('graph, graph_version')
      .eq('user_id', turn.user_id)
      .single()

    const currentGraph: NarrativeGraph = narrativeRow?.graph
      ? normalizeGraph(JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!)))
      : emptyGraph()
    const updatedGraph = mergeExtraction(currentGraph, extraction)
    const newVersion = (narrativeRow?.graph_version ?? 0) + 1

    const updateData: Record<string, unknown> = {
      user_id: turn.user_id,
      graph: encrypt(JSON.stringify(updatedGraph), process.env.MEMORY_ENCRYPTION_KEY!),
      graph_version: newVersion,
      updated_at: new Date().toISOString(),
    }

    await supabase
      .from('narratives')
      .upsert(updateData, { onConflict: 'user_id' })

    // Mark turn as processed
    await supabase
      .from('turns')
      .update({ processed: true })
      .eq('id', turnId)

    // Settle the conversation and create an entries row (email conversations are one-shot — settle after processing)
    const now = new Date().toISOString()
    const isFirstEntry = updatedGraph.total_entries === 1

    // First entry goes through immediate follow-up; subsequent entries queue for batch processing
    const conversationUpdate = isFirstEntry
      ? { status: 'settled', settled_at: now }
      : { status: 'settled', settled_at: now, queued_for_batch: true }

    await supabase
      .from('conversations')
      .update(conversationUpdate)
      .eq('id', turn.conversation_id)
      .eq('status', 'active')  // only settle if still active — don't overwrite wrap_offered/settled

    // Mark the linked prompt as complete (if conversation has one)
    const { data: conversation } = await supabase
      .from('conversations')
      .select('queued_prompt_id')
      .eq('id', turn.conversation_id)
      .single()

    if (conversation?.queued_prompt_id) {
      await supabase
        .from('queued_prompts')
        .update({ delivery_state: 'complete' })
        .eq('id', conversation.queued_prompt_id)
    }

    const { data: existingEntry } = await supabase
      .from('entries')
      .select('id')
      .eq('conversation_id', turn.conversation_id)
      .maybeSingle()

    if (!existingEntry) {
      const { data: newEntry } = await supabase
        .from('entries')
        .insert({
          conversation_id: turn.conversation_id,
          user_id: turn.user_id,
          status: 'settled',
          origin: 'biographer',
          era: extraction.era ?? null,
          themes: extraction.themes ?? [],
          people_mentioned: extraction.people?.map(p => p.name) ?? [],
          entry_context: encrypt(JSON.stringify(extraction), process.env.MEMORY_ENCRYPTION_KEY!),
          settled_at: now,
        })
        .select('id')
        .single()

      // Generate and store embedding from the decrypted user response
      if (newEntry) {
        const embeddingResult = await generateEmbedding(responseText)
        if (embeddingResult) {
          await supabase
            .from('entries')
            .update({ embedding: JSON.stringify(embeddingResult.embedding) })
            .eq('id', newEntry.id)
          void logTokenUsage(supabase, {
            userId: turn.user_id,
            conversationId: turn.conversation_id,
            inngestFunction: 'enrich-entry',
            model: 'text-embedding-3-small',
            inputTokens: embeddingResult.inputTokens,
            outputTokens: 0,
            purpose: 'entry embedding',
          })
        }
      }
    }

    // Auto-generate story entry (medium intensity) — errors are swallowed, must not block enrichment
    await autoGenerateStory({
      conversationId: turn.conversation_id,
      userId: turn.user_id,
      turns: [{ role: 'user', content: responseText }],
      channel: 'email',
      supabase,
    })

    // Detect completeness gaps and store pending clarifications (skip already-existing ones)
    const gaps = findEntryGaps(extraction, updatedGraph)
    if (gaps.length > 0) {
      const { data: existing } = await supabase
        .from('clarifications')
        .select('entity_type, entity_key, field')
        .eq('user_id', turn.user_id)
        .in('status', ['pending', 'answered'])
      const existingSet = new Set(
        (existing ?? []).map(r => `${r.entity_type}:${r.entity_key}:${r.field}`)
      )
      const newGaps = gaps.filter(
        g => !existingSet.has(`${g.entity_type}:${g.entity_key}:${g.field}`)
      )
      if (newGaps.length > 0) {
        const { error: insertError } = await supabase.from('clarifications').insert(
          newGaps.map(gap => ({
            user_id: turn.user_id,
            conversation_id: turn.conversation_id,
            entity_type: gap.entity_type,
            entity_key: gap.entity_key,
            field: gap.field,
            question: gap.question,
            status: 'pending',
          }))
        )
        if (insertError) throw new Error(`Failed to insert clarifications: ${insertError.message}`)
      }
    }

    // First entry gets a dedicated follow-up that reads the actual entry and continues it directly.
    // All subsequent entries are queued for batch processing at midnight ET.
    if (isFirstEntry) {
      await inngest.send({ name: 'fireside/prompt.first-followup', data: { userId: turn.user_id, turnId: turn.id } })
    }
    // Subsequent entries: synthesis and prompt selection will be handled by batch-process-pending at midnight ET

    return {
      turnId,
      era: extraction.era,
      themes: extraction.themes,
      graphVersion: newVersion,
    }
  }
)
