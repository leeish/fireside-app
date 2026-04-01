import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { claudeComplete, logTokenUsage, getClaudeClient, resolveApiKey, withUserKeyFallback } from '@/lib/ai'
import { decrypt } from '@/lib/crypto'
import { buildSystemPrompt } from '@/lib/craft-system'
import { generateEmbedding } from '@/lib/embeddings'
import type { NarrativeGraph } from '@/lib/graph'
import { selectTopThreads } from './select-next-prompt-engine'

type SelectNextPromptEvent = { data: { userId: string; skipScheduling?: boolean } }

// ─── Topic-scoped notes ───────────────────────────────────────
const TOPIC_NOTES_SYSTEM = `You are a biographer's research assistant preparing working notes before a prompt selection session.

You will be given a set of candidate topics the biographer is considering exploring next, and the actual journal entries this person has written that are relevant to each topic.

Your job is to write focused research notes on each candidate topic — what this person has actually said about it, what feels unfinished or unresolved, and what specific angle might be worth exploring further in the next question.

CRITICAL RULES:
- Read all entries for a topic collectively before forming any observation. A single entry is not the full picture. If entries show tension, complexity, or contradiction about a topic, capture that honestly — "mixed feelings about his dad" is more accurate and more useful than either entry alone.
- Only write what is supported by the entry text provided. Do not infer, extrapolate, or fill gaps with plausible-sounding detail.
- If an entry touches a topic only briefly, say so — do not expand it into something it isn't.
- Note absences plainly: if a topic has been mentioned but never landed on, name that directly.
- These notes will be used to write the next question this person receives. Accuracy matters more than eloquence. A wrong note leads to a wrong question.

Write 3-5 sentences per candidate topic. Stay grounded. Stay specific.`

// ─── Quality check ────────────────────────────────────────────
const QUALITY_CHECK_PROMPT = `Evaluate this question and return JSON: { "pass": boolean, "reason": string }

Fail if any of these are true:
1. Could apply to any person — not grounded in something specific to this person
2. Contains more than one question
3. Starts with the word "I"
4. Longer than 3 sentences
5. Pushes a sensitive/deflected topic without adequate context
6. Sounds generic, clinical, or like a form field

Pass if: specific to this person, one question, opens something rather than closing it, emotionally appropriate.`

async function qualityCheck(
  question: string,
  graphContext: string,
  apiKey?: string,
  onUsage?: (inputTokens: number, outputTokens: number) => void,
): Promise<{ pass: boolean; reason: string }> {
  try {
    const result = await claudeComplete({
      system: QUALITY_CHECK_PROMPT + '\n\nReturn valid JSON only: {"pass": true/false, "reason": "..."}',
      user: `Person context: ${graphContext}\n\nQuestion to evaluate: "${question}"`,
      temperature: 0,
      maxTokens: 200,
      apiKey,
    })
    onUsage?.(result.inputTokens, result.outputTokens)
    return JSON.parse(result.text)
  } catch {
    return { pass: false, reason: 'failed to parse quality check response' }
  }
}

// ─────────────────────────────────────────────────────────────
export const selectNextPrompt = inngest.createFunction(
  { id: 'select-next-prompt', retries: 3, triggers: [{ event: 'fireside/prompt.select' }] },
  async ({ event }: { event: SelectNextPromptEvent }) => {
    const { userId, skipScheduling } = event.data
    const supabase = createServiceClient()

    // Load user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, display_name, cadence, onboarding_profile, next_prompt_delivery_date')
      .eq('id', userId)
      .single()

    if (userError || !user) throw new Error(`User not found: ${userId}`)

    const userApiKey = await resolveApiKey(userId, supabase)

    // Load narrative graph
    const { data: narrativeRow } = await supabase
      .from('narratives')
      .select('graph')
      .eq('user_id', userId)
      .single()

    const graph: NarrativeGraph = narrativeRow?.graph
      ? JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!))
      : {} as NarrativeGraph

    // Seed display_name from user record if missing in graph
    if (!graph.display_name) {
      graph.display_name = user.display_name ?? user.email
    }

    // Load previously delivered questions — passed to Claude for selection + repetition avoidance
    const { data: promptHistory } = await supabase
      .from('queued_prompts')
      .select('question, question_type')
      .eq('user_id', userId)
      .neq('delivery_state', 'queued')
      .order('created_at', { ascending: true })

    const { model: claudeModel } = getClaudeClient()

    // Scoring engine — returns top 5 candidates for Claude to choose from
    const candidates = selectTopThreads(graph)

    // ─── RAG: retrieve relevant entries per candidate thread ──────────
    let promptContext = ''

    if (graph.total_entries > 0) {
      // Embed all 5 thread descriptions in parallel
      const embedResults = await Promise.all(
        candidates.map(async (candidate) => {
          const embedding = await generateEmbedding(candidate.description)
          return { candidate, embedding }
        })
      )

      // Run similarity search for each thread in parallel (top 2 entries per thread)
      const matchResults = await Promise.all(
        embedResults.map(async ({ candidate, embedding }) => {
          if (!embedding) return { candidate, rows: [] }
          const { data: rows } = await supabase.rpc('match_entries', {
            query_embedding: JSON.stringify(embedding),
            match_user_id: userId,
            match_count: 2,
          })
          return { candidate, rows: rows ?? [] }
        })
      )

      // Collect unique conversation IDs across all matches
      const seenEntryIds = new Set<string>()
      const uniqueMatches: Array<{ entryId: string; conversationId: string }> = []
      for (const { rows } of matchResults) {
        for (const row of rows) {
          if (!seenEntryIds.has(row.id)) {
            seenEntryIds.add(row.id)
            uniqueMatches.push({ entryId: row.id, conversationId: row.conversation_id })
          }
        }
      }

      // Fetch and decrypt user turns for each matched entry
      const entryTextMap = new Map<string, string>()
      await Promise.all(
        uniqueMatches.map(async ({ entryId, conversationId }) => {
          const { data: turns } = await supabase
            .from('turns')
            .select('content')
            .eq('conversation_id', conversationId)
            .eq('role', 'user')
            .order('created_at', { ascending: true })

          if (!turns || turns.length === 0) return

          const text = turns
            .map(t => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })
            .filter(Boolean)
            .join('\n\n')

          if (text) entryTextMap.set(entryId, text)
        })
      )

      // Build context block per candidate thread
      const threadBlocks = matchResults
        .map(({ candidate, rows }) => {
          const entries = rows
            .map((r: { id: string }) => entryTextMap.get(r.id))
            .filter(Boolean) as string[]

          if (entries.length === 0) {
            return `Thread: ${candidate.description}\nNo prior entries found on this topic.`
          }

          return `Thread: ${candidate.description}\nRelevant entries:\n${entries.join('\n---\n')}`
        })
        .join('\n\n===\n\n')

      // Generate topic-scoped notes with Haiku
      if (threadBlocks) {
        const notesResult = await withUserKeyFallback(userId, supabase, userApiKey, (key) =>
          claudeComplete({
            system: TOPIC_NOTES_SYSTEM,
            user: threadBlocks,
            temperature: 0.3,
            maxTokens: 1500,
            apiKey: key,
          })
        )

        promptContext = notesResult.text

        await logTokenUsage(supabase, {
          userId,
          inngestFunction: 'select-next-prompt',
          model: 'claude-haiku-4-5-20251001',
          inputTokens: notesResult.inputTokens,
          outputTokens: notesResult.outputTokens,
          purpose: 'topic-scoped notes',
        })
      }
    }

    // ─── Build generation prompt ──────────────────────────────────────
    const systemPrompt = buildSystemPrompt(graph)

    const graphContext = `
Name: ${graph.display_name ?? 'Unknown'}
Total entries: ${graph.total_entries}
Eras covered: ${JSON.stringify(graph.eras)}
People: ${JSON.stringify(Object.keys(graph.people ?? {}))}
Themes: ${(graph.themes ?? []).join(', ')}
Interests: ${(graph.interests ?? []).join(', ')}
Events mentioned: ${(graph.events ?? []).join(', ')}
Places mentioned: ${(graph.places ?? []).join(', ')}
Open threads (topics worth returning to): ${(graph.open_threads ?? []).join('; ')}
Deflections: ${(graph.deflections ?? []).join('; ')}
Last entry weight: ${graph.last_entry_weight ?? 'unknown'}
Faith: ${JSON.stringify(graph.faith)}
${promptContext ? `Biographer's notes on candidate topics (based on what this person actually wrote):\n${promptContext}` : 'No prior entries yet.'}
`.trim()

    const historyBlock = promptHistory && promptHistory.length > 0
      ? `\n\nPreviously asked questions — do not repeat any of these. Returning to a topic for a deeper angle is encouraged — find a new entry point, a specific detail, or a layer beneath what's already been said:\n${promptHistory.map((p, i) => `${i + 1}. [${p.question_type ?? 'unknown'}] ${p.question}`).join('\n')}`
      : ''

    const candidateList = candidates
      .map((t, i) => `${i + 1}. threadId="${t.threadId}" | type=${t.questionType} | ${t.description}`)
      .join('\n')

    const recentTypes = (promptHistory ?? []).slice(-3).map(p => p.question_type).filter(Boolean)

    const earlyNote = graph.total_entries < 15
      ? `- This person is early in their story (entry ${graph.total_entries + 1} of their first 15). Strongly favor threads that open new chapters over ones that deepen what's already been shared.`
      : ''

    const varietyNote = recentTypes.length >= 2
      ? `- Recent question types (oldest to newest): ${recentTypes.join(' → ')}. Avoid repeating the same category back to back.`
      : ''

    const taskInstruction = `
Graph context:
${graphContext}

CANDIDATE THREADS — choose one and write the question:
${candidateList}
${historyBlock}

SELECTION GUIDANCE:
${earlyNote}
${varietyNote}
- Pick the thread that creates the best narrative experience given the full history above.
- A good biographer reads the room: consider pacing, emotional weight, and what chapters feel neglected.
- Do not invent a new topic. Choose from the candidates only.

Return ONLY valid JSON, no markdown, no explanation:
{"selectedThreadId": "...", "questionType": "...", "question": "..."}
`.trim()

    // Generate question (up to 2 attempts)
    let question = ''
    let selectedThreadId = candidates[0].threadId
    let selectedQuestionType = candidates[0].questionType

    for (let attempt = 1; attempt <= 2; attempt++) {
      const genResult = await withUserKeyFallback(userId, supabase, userApiKey, (key) => claudeComplete({
        system: systemPrompt,
        user: attempt === 1
          ? taskInstruction
          : taskInstruction + '\n\nPrevious attempt failed. Return valid JSON only: {"selectedThreadId": "...", "questionType": "...", "question": "..."}',
        temperature: 0.6,
        maxTokens: 400,
        apiKey: key,
      }))

      await logTokenUsage(supabase, {
        userId,
        inngestFunction: 'select-next-prompt',
        model: claudeModel,
        inputTokens: genResult.inputTokens,
        outputTokens: genResult.outputTokens,
        purpose: 'prompt selection',
      })

      try {
        const parsed = JSON.parse(genResult.text)
        question = parsed.question ?? ''

        // Validate Claude's thread selection against the candidate list
        const match = candidates.find(c => c.threadId === parsed.selectedThreadId)
        if (match) {
          selectedThreadId = match.threadId
          selectedQuestionType = match.questionType
        } else {
          console.warn(`[select-next-prompt] Claude selected unknown threadId "${parsed.selectedThreadId}" — using top candidate`)
        }
      } catch {
        // JSON parse failed — retry
        continue
      }

      if (!question) continue

      const check = await withUserKeyFallback(userId, supabase, userApiKey, (key) =>
        qualityCheck(question, graphContext, key, (inputTokens, outputTokens) => {
          void logTokenUsage(supabase, { userId, inngestFunction: 'select-next-prompt', model: claudeModel, inputTokens, outputTokens, purpose: 'quality check' })
        })
      )
      if (check.pass) break

      if (attempt === 2) {
        console.warn(`[select-next-prompt] Quality check failed after 2 attempts for user ${userId}: ${check.reason}`)
      }
    }

    if (!question) throw new Error('Failed to generate question')

    // Build user-friendly reasoning
    const selectedCandidate = candidates.find(c => c.threadId === selectedThreadId)
    const reasoning = selectedCandidate
      ? `Selected: ${selectedCandidate.description}`
      : 'Automatic selection based on conversation history'

    // Insert queued_prompt with topic-scoped notes stored as prompt_context
    const { data: qp, error: qpError } = await supabase
      .from('queued_prompts')
      .insert({
        user_id: userId,
        question,
        thread_id: selectedThreadId,
        question_type: selectedQuestionType,
        delivery_state: 'queued',
        model_used: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
        reasoning,
        prompt_context: promptContext || null,
      })
      .select('id')
      .single()

    if (qpError || !qp) throw new Error(`Failed to insert queued_prompt: ${qpError?.message}`)

    // Update soft pointer on users
    await supabase
      .from('users')
      .update({ queued_prompt_id: qp.id })
      .eq('id', userId)

    if (!skipScheduling) {
      const CADENCE_DAYS: Record<string, number> = {
        daily: 1,
        few_per_week: 3,
        weekly: 7,
      }
      const deliverInDays = CADENCE_DAYS[user.cadence ?? 'weekly'] ?? 7
      const deliverAt = new Date()
      deliverAt.setDate(deliverAt.getDate() + deliverInDays)

      if (user.next_prompt_delivery_date && new Date(user.next_prompt_delivery_date) > deliverAt) {
        return { userId, queuedPromptId: qp.id, skipped: 'delivery already scheduled' }
      }

      await inngest.send({
        name: 'fireside/prompt.deliver',
        data: { userId },
        ts: deliverAt.getTime(),
      })

      await supabase
        .from('users')
        .update({ next_prompt_delivery_date: deliverAt.toISOString() })
        .eq('id', userId)
    }

    return {
      userId,
      queuedPromptId: qp.id,
      threadId: selectedThreadId,
      questionType: selectedQuestionType,
    }
  }
)
