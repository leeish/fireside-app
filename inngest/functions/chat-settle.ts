import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/crypto'
import { getAIClient, logTokenUsage } from '@/lib/ai'
import { mergeExtraction, emptyGraph, findCompletenessGaps, type ExtractionResult, type NarrativeGraph } from '@/lib/graph'

type ChatSettleEvent = {
  data: {
    conversationId: string
    userId: string
  }
}

const EXTRACTION_SYSTEM = `You are analyzing a personal journal conversation. Extract structured metadata from the full transcript.

Return a JSON object with exactly these fields:
- people: array of { name, relationship, sentiment ("warm"|"complicated"|"neutral"|"positive"|"negative"), new_facts (string[]), new_threads (string[]) }
- places: string[] — specific places mentioned
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
      .order('created_at', { ascending: true })

    if (!turns || turns.length === 0) return { skipped: 'no turns found' }

    // Build full transcript with decrypted user turns
    const transcript = turns
      .map(t => {
        const content = t.role === 'user'
          ? (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })()
          : t.content
        return `${t.role === 'user' ? 'Person' : 'Biographer'}: ${content}`
      })
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
      ? JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!))
      : emptyGraph()
    const updatedGraph = mergeExtraction(currentGraph, extraction)
    const newVersion = (narrativeRow?.graph_version ?? 0) + 1

    // Synthesis is deferred to batch-process-pending. Preserve existing rolling_summary
    // since mergeExtraction doesn't update it — only synthesis does.
    const updateData: Record<string, unknown> = {
      user_id: userId,
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

    // Mark all user turns in this conversation as processed
    const userTurnIds = turns.filter(t => t.role === 'user').map(t => t.id)
    if (userTurnIds.length > 0) {
      await supabase
        .from('turns')
        .update({ processed: true })
        .in('id', userTurnIds)
    }

    // Detect completeness gaps and store pending clarifications
    const gaps = findCompletenessGaps(updatedGraph)
    if (gaps.length > 0) {
      const clarifications = gaps.map(gap => ({
        user_id: userId,
        conversation_id: conversationId,
        entity_type: gap.entity_type,
        entity_key: gap.entity_key,
        field: gap.field,
        question: gap.question,
        status: 'pending',
      }))
      await supabase.from('clarifications').insert(clarifications)
    }

    // Queue the next prompt
    await inngest.send({
      name: 'fireside/prompt.select',
      data: { userId },
    })

    return { conversationId, graphVersion: newVersion, themes: extraction.themes }
  }
)
