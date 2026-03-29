import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { getAIClient } from '@/lib/ai'
import { mergeExtraction, emptyGraph, type ExtractionResult, type NarrativeGraph } from '@/lib/graph'

type EnrichEntryEvent = { data: { turnId: string } }

const EXTRACTION_SYSTEM = `You are analyzing a personal journal entry. Extract structured metadata from the user's response.

Return a JSON object with exactly these fields:
- people: array of { name, relationship, sentiment ("warm"|"complicated"|"neutral"|"positive"|"negative"), new_facts (string[]), new_threads (string[]) }
- places: string[] — specific places mentioned
- era: one of "childhood" | "youth" | "mission" | "marriage" | "parenthood" | "career" | "other" | null
- emotional_weight: "heavy" | "medium" | "light"
- themes: string[] — emotional/narrative themes, e.g. ["loss", "belonging", "identity", "faith", "grief", "resilience", "family tension"]
- interests: string[] — hobbies, passions, and activities they enjoy or engage in, e.g. ["woodworking", "cooking", "hiking", "reading", "music"]
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

    // Load or initialize the user's narrative graph
    const { data: narrativeRow } = await supabase
      .from('narratives')
      .select('graph, graph_version')
      .eq('user_id', turn.user_id)
      .single()

    const currentGraph: NarrativeGraph = (narrativeRow?.graph as NarrativeGraph) ?? emptyGraph()
    const updatedGraph = mergeExtraction(currentGraph, extraction)
    const newVersion = (narrativeRow?.graph_version ?? 0) + 1

    // Synthesis is deferred to select-next-prompt — no point synthesizing now
    // when the result won't be used until the next prompt is generated.
    await supabase
      .from('narratives')
      .upsert({
        user_id: turn.user_id,
        graph: updatedGraph,
        graph_version: newVersion,
        rolling_summary: updatedGraph.rolling_summary ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    // Mark turn as processed
    await supabase
      .from('turns')
      .update({ processed: true })
      .eq('id', turnId)

    // Settle the conversation and create an entries row (email conversations are one-shot — settle after processing)
    const now = new Date().toISOString()

    await supabase
      .from('conversations')
      .update({ status: 'settled', settled_at: now })
      .eq('id', turn.conversation_id)
      .eq('status', 'active')  // only settle if still active — don't overwrite wrap_offered/settled

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

    // First entry gets a dedicated follow-up that reads the actual entry and continues it directly.
    // All subsequent entries go through the standard scoring engine.
    if (updatedGraph.total_entries === 1) {
      await inngest.send({ name: 'fireside/prompt.first-followup', data: { userId: turn.user_id, turnId: turn.id } })
    } else {
      await inngest.send({ name: 'fireside/prompt.select', data: { userId: turn.user_id } })
    }

    return {
      turnId,
      era: extraction.era,
      themes: extraction.themes,
      graphVersion: newVersion,
    }
  }
)
