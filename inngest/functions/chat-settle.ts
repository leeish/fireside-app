import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/crypto'
import { getAIClient, logTokenUsage } from '@/lib/ai'
import { generateEmbedding } from '@/lib/embeddings'
import { mergeExtraction, normalizeGraph, emptyGraph, findEntryGaps, type ExtractionResult, type NarrativeGraph } from '@/lib/graph'
import { autoGenerateStory } from '@/lib/story'

type ChatSettleEvent = {
  data: {
    conversationId: string
    userId: string
  }
}

const EXTRACTION_SYSTEM = `You are analyzing a personal journal conversation. Extract structured metadata from the full transcript.

Return a JSON object with exactly these fields:
- people: array of { name, relationship, sentiment ("warm"|"complicated"|"neutral"|"positive"|"negative"), new_facts (string[]), new_threads (string[]) }
- places: array of { name, city?, state?, country?, address? } — specific places mentioned; only populate location fields when explicitly stated or strongly inferable
- era: one of "childhood" | "youth" | "mission" | "marriage" | "parenthood" | "career" | "other" | null
- emotional_weight: "heavy" | "medium" | "light"
- themes: string[] — e.g. ["faith", "family", "childhood", "belonging"]
- deflections: string[] — things started then redirected
- faith_signals: { tradition_signals: string[], milestones_mentioned: string[], spiritual_moments: string[] }
- new_threads_opened: string[] — topics mentioned in passing worth returning to
- one_line_summary: string — 1-2 sentence third-person summary of what this conversation captured`

export const chatSettle = inngest.createFunction(
  { id: 'chat-settle', retries: 2, triggers: [{ event: 'fireside/chat.settle' }] },
  async ({ event }: { event: ChatSettleEvent }) => {
    const { conversationId, userId } = event.data
    const supabase = createServiceClient()
    const { client, model } = getAIClient()

    // Load all turns from the conversation
    const { data: turns } = await supabase
      .from('turns')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('is_synthetic', false)
      .order('created_at', { ascending: true })

    if (!turns || turns.length === 0) return { skipped: 'no turns found' }

    // Build full transcript with decrypted user turns
    const decryptedTurns = turns.map(t => ({
      role: t.role,
      content: t.role === 'user'
        ? (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })()
        : t.content,
    }))

    const transcript = decryptedTurns
      .map(t => `${t.role === 'user' ? 'Person' : 'Biographer'}: ${t.content}`)
      .join('\n\n')

    // User-only text for embedding — captures what the person said, not the questions asked
    const userText = decryptedTurns
      .filter(t => t.role === 'user')
      .map(t => t.content)
      .filter(Boolean)
      .join('\n\n')

    // Run extraction on full conversation transcript
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      store: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM },
        { role: 'user', content: `Full conversation transcript:\n\n${transcript}` },
      ],
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const extraction: ExtractionResult = JSON.parse(raw)

    await logTokenUsage(supabase, {
      userId,
      conversationId,
      inngestFunction: 'chat-settle',
      model,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      purpose: 'conversation extraction',
    })

    // Load or initialize narrative graph
    const { data: narrativeRow } = await supabase
      .from('narratives')
      .select('graph, graph_version')
      .eq('user_id', userId)
      .single()

    const currentGraph: NarrativeGraph = narrativeRow?.graph
      ? normalizeGraph(JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!)))
      : emptyGraph()
    const updatedGraph = mergeExtraction(currentGraph, extraction)
    const newVersion = (narrativeRow?.graph_version ?? 0) + 1

    const updateData: Record<string, unknown> = {
      user_id: userId,
      graph: encrypt(JSON.stringify(updatedGraph), process.env.MEMORY_ENCRYPTION_KEY!),
      graph_version: newVersion,
      updated_at: new Date().toISOString(),
    }

    await supabase
      .from('narratives')
      .upsert(updateData, { onConflict: 'user_id' })

    // Mark all user turns in this conversation as processed
    const userTurnIds = turns.filter(t => t.role === 'user').map(t => t.id)
    if (userTurnIds.length > 0) {
      await supabase
        .from('turns')
        .update({ processed: true })
        .in('id', userTurnIds)
    }

    // Detect completeness gaps and store pending clarifications (skip already-existing ones)
    const gaps = findEntryGaps(extraction, updatedGraph)
    if (gaps.length > 0) {
      const { data: existing } = await supabase
        .from('clarifications')
        .select('entity_type, entity_key, field')
        .eq('user_id', userId)
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
            user_id: userId,
            conversation_id: conversationId,
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

    // Create entry row if it doesn't exist, then generate embedding from user text
    const { data: existingEntry } = await supabase
      .from('entries')
      .select('id')
      .eq('conversation_id', conversationId)
      .maybeSingle()

    const entryId = existingEntry?.id ?? null
    let newEntryId: string | null = null

    if (!existingEntry) {
      const now = new Date().toISOString()
      const { data: newEntry } = await supabase
        .from('entries')
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          status: 'settled',
          origin: 'biographer',
          era: extraction.era ?? null,
          themes: extraction.themes ?? [],
          people_mentioned: extraction.people?.map(p => p.name) ?? [],
          settled_at: now,
        })
        .select('id')
        .single()
      newEntryId = newEntry?.id ?? null
    }

    const targetEntryId = entryId ?? newEntryId
    if (targetEntryId && userText) {
      const embeddingResult = await generateEmbedding(userText)
      if (embeddingResult) {
        await supabase
          .from('entries')
          .update({ embedding: JSON.stringify(embeddingResult.embedding) })
          .eq('id', targetEntryId)
        void logTokenUsage(supabase, {
          userId,
          conversationId,
          inngestFunction: 'chat-settle',
          model: 'text-embedding-3-small',
          inputTokens: embeddingResult.inputTokens,
          outputTokens: 0,
          purpose: 'entry embedding',
        })
      }
    }

    // Auto-generate story entry (medium intensity) — errors are swallowed, must not block settle
    const fullyDecryptedTurns = turns.map(t => ({
      role: t.role,
      content: (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })(),
    }))
    await autoGenerateStory({ conversationId, userId, turns: fullyDecryptedTurns, channel: 'chat', supabase })

    // Mark the linked prompt as complete if this conversation was delivered via a queued prompt
    const { data: settledConversation } = await supabase
      .from('conversations')
      .select('queued_prompt_id')
      .eq('id', conversationId)
      .single()

    if (settledConversation?.queued_prompt_id) {
      await supabase
        .from('queued_prompts')
        .update({ delivery_state: 'complete' })
        .eq('id', settledConversation.queued_prompt_id)
    }

    // Queue conversation for batch processing — synthesis and prompt selection happen at midnight ET
    await supabase
      .from('conversations')
      .update({ queued_for_batch: true })
      .eq('id', conversationId)

    return { conversationId, graphVersion: newVersion, themes: extraction.themes, queued_for_batch: true }
  }
)
