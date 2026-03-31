import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/crypto'
import { getAIClient, logTokenUsage } from '@/lib/ai'
import { mergeExtraction, emptyGraph, findCompletenessGaps, type ExtractionResult, type NarrativeGraph } from '@/lib/graph'

type EnrichEntryEvent = { data: { turnId: string } }

const EXTRACTION_SYSTEM = `You are analyzing a personal journal entry. Extract structured metadata from the user's response.

Return a JSON object with exactly these fields:
- people: array of { name, relationship, sentiment ("warm"|"complicated"|"neutral"|"positive"|"negative"), new_facts (string[]), new_threads (string[]) }
  IMPORTANT: Only extract real people the user mentions. Exclude:
  - The biographer or interviewer (don't extract "Biographer" or similar)
  - Generic placeholders like "Person", "User", "Subject"
  - The user themselves (they are the narrator, not a person in the story)
  Focus on family members, friends, colleagues, and other real people in their accounts.
- places: string[] — specific places mentioned
- era: one of "childhood" | "youth" | "mission" | "marriage" | "parenthood" | "career" | "other" | null
- emotional_weight: "heavy" | "medium" | "light"
- themes: string[] — emotional/narrative themes, e.g. ["loss", "belonging", "identity", "faith", "grief", "resilience", "family tension"]
- interests: string[] — hobbies, passions, and activities they enjoy or engage in, e.g. ["woodworking", "cooking", "hiking", "reading", "music"]
- events: string[] — specific named experiences worth exploring further, e.g. ["2025 Florida vacation", "cruise to Alaska", "dad's retirement party", "the summer we renovated the house"]
- deflections: string[] — things started then redirected, e.g. ["started to discuss father leaving but changed subject"]
- faith_signals: { tradition_signals: string[], milestones_mentioned: string[], spiritual_moments: string[] }
- new_threads_opened: string[] — specific memories, events, or topics they mentioned briefly that are worth returning to, e.g. ["the summer they worked on a fishing boat", "a falling out with a close friend in college"]
- one_line_summary: string — 1-2 sentence third-person summary of what this memory is about`

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

    const questionText = bioTurns?.[0]?.content ?? ''

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
        { role: 'system', content: EXTRACTION_SYSTEM },
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
      ? JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!))
      : emptyGraph()
    const updatedGraph = mergeExtraction(currentGraph, extraction)
    const newVersion = (narrativeRow?.graph_version ?? 0) + 1

    // Synthesis is deferred to batch-process-pending. Preserve existing rolling_summary
    // since mergeExtraction doesn't update it — only synthesis does.
    const updateData: Record<string, unknown> = {
      user_id: turn.user_id,
      graph: encrypt(JSON.stringify(updatedGraph), process.env.MEMORY_ENCRYPTION_KEY!),
      graph_version: newVersion,
      updated_at: new Date().toISOString(),
    }
    // Only update rolling_summary if it's non-empty; otherwise preserve the existing one
    if (updatedGraph.rolling_summary) {
      updateData.rolling_summary = encrypt(updatedGraph.rolling_summary, process.env.MEMORY_ENCRYPTION_KEY!)
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

    // Mark the engaged prompt as complete
    await supabase
      .from('queued_prompts')
      .update({ delivery_state: 'complete' })
      .eq('user_id', turn.user_id)
      .eq('delivery_state', 'engaged')

    const { data: existingEntry } = await supabase
      .from('entries')
      .select('id')
      .eq('conversation_id', turn.conversation_id)
      .maybeSingle()

    if (!existingEntry) {
      await supabase
        .from('entries')
        .insert({
          conversation_id: turn.conversation_id,
          user_id: turn.user_id,
          status: 'settled',
          origin: 'biographer',
          era: extraction.era ?? null,
          themes: extraction.themes ?? [],
          settled_at: now,
        })
    }

    // Detect completeness gaps and store pending clarifications
    const gaps = findCompletenessGaps(updatedGraph)
    if (gaps.length > 0) {
      const clarifications = gaps.map(gap => ({
        user_id: turn.user_id,
        conversation_id: turn.conversation_id,
        entity_type: gap.entity_type,
        entity_key: gap.entity_key,
        field: gap.field,
        question: gap.question,
        status: 'pending',
      }))
      await supabase.from('clarifications').insert(clarifications)
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
