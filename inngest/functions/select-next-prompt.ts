import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { claudeComplete } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/craft-system'
import { synthesizeGraph } from '@/lib/synthesize-graph'
import type { NarrativeGraph } from '@/lib/graph'

type SelectNextPromptEvent = { data: { userId: string } }

// ─── Question types ───────────────────────────────────────────
type QType =
  | 'depth' | 'origin' | 'sensory' | 'relationship' | 'era'
  | 'milestone' | 'faith_milestone' | 'faith_texture' | 'lightness'

interface ScoredThread {
  threadId: string
  questionType: QType
  score: number
  description: string  // passed to LLM as context
}

const KNOWN_ERAS = ['childhood', 'youth', 'mission', 'marriage', 'parenthood', 'career']

// ─── Decision engine (pure logic — no LLM) ───────────────────
// Returns top 5 candidates. Claude makes the final selection.
function selectTopThreads(graph: NarrativeGraph): ScoredThread[] {
  const threads: ScoredThread[] = []
  const lastWeight = graph.last_entry_weight ?? 'medium'
  const isLDS = graph.faith?.tradition === 'lds'
  const missionConfirmed = graph.faith?.prompt_readiness?.mission === 'confirmed'

  // Score uncaptured / thin eras
  for (const era of KNOWN_ERAS) {
    const eraData = graph.eras[era]
    let score = 0
    if (!eraData || eraData.entries === 0) score = 20
    else if (eraData.richness === 'low') score = 10
    else if (eraData.richness === 'medium') score = 5

    if (era === 'mission' && missionConfirmed) score += 15
    if (lastWeight === 'heavy') score -= 5  // deprioritize more digging after heavy entry

    if (score > 0) {
      threads.push({
        threadId: `era:${era}`,
        questionType: 'era',
        score,
        description: `Open the ${era} chapter`,
      })
    }
  }

  // Score people
  for (const [name, node] of Object.entries(graph.people ?? {})) {
    let score = 0
    if (node.mentions < 2) score += 15
    if (node.unexplored.length > 0) score += 10
    if (node.sentiment === 'complicated') score += 8
    if (lastWeight === 'heavy' && node.sentiment === 'warm') score += 12

    const qType: QType = node.unexplored.length > 0 ? 'depth' : 'relationship'
    const description = node.unexplored.length > 0
      ? `Explore unexplored thread about ${name}: ${node.unexplored[0]}`
      : `Learn more about ${name} (${node.relationship ?? 'person in their life'})`

    threads.push({ threadId: `person:${name}`, questionType: qType, score, description })
  }

  // Lightness after heavy entry — scored high enough to reliably win
  if (lastWeight === 'heavy') {
    threads.push({
      threadId: 'lightness',
      questionType: 'lightness',
      score: 40,
      description: 'Shift to something warm or funny after a heavy entry',
    })
  }

  // Open threads — topics the person mentioned in passing that are worth returning to
  for (const thread of graph.open_threads ?? []) {
    threads.push({
      threadId: `open_thread:${thread.slice(0, 40)}`,
      questionType: 'depth',
      score: 18,
      description: `Specific topic mentioned in passing, worth returning to: "${thread}"`,
    })
  }

  // Themes — ask an origin question to trace where a pattern began
  const HEAVY_THEMES = ['loss', 'grief', 'death', 'trauma', 'abuse', 'addiction']
  for (const theme of graph.themes ?? []) {
    const isHeavy = HEAVY_THEMES.some(h => theme.toLowerCase().includes(h))
    const score = isHeavy
      ? (lastWeight === 'heavy' ? 10 : 20)  // deprioritize heavy themes after a heavy entry
      : 14
    threads.push({
      threadId: `theme:${theme}`,
      questionType: 'origin',
      score,
      description: `Theme present in their story: "${theme}" — ask an origin question to find where this began`,
    })
  }

  // Places — ask a sensory question to bring a place to life
  for (const place of graph.places ?? []) {
    threads.push({
      threadId: `place:${place.slice(0, 40)}`,
      questionType: 'sensory',
      score: 12,
      description: `Place they've mentioned: "${place}" — ask for a sensory memory of this place`,
    })
  }

  // Events — specific named experiences worth exploring in depth
  for (const event of graph.events ?? []) {
    threads.push({
      threadId: `event:${event.slice(0, 40)}`,
      questionType: 'depth',
      score: 16,
      description: `Specific experience they've mentioned: "${event}" — ask for a memory or moment from this event`,
    })
  }

  // Interests — go deeper on a hobby or passion they've mentioned
  for (const interest of graph.interests ?? []) {
    threads.push({
      threadId: `interest:${interest.slice(0, 40)}`,
      questionType: 'depth',
      score: 15,
      description: `Interest or passion they've mentioned: "${interest}" — explore what it means to them or where it started`,
    })
  }

  // Faith texture if faith present but unexplored
  if (graph.faith?.tier && graph.faith.tier >= 2 && (graph.faith.spiritual_moments?.length ?? 0) < 2) {
    threads.push({
      threadId: 'faith_texture',
      questionType: 'faith_texture',
      score: 18,
      description: 'Explore the lived experience of their faith',
    })
  }

  // LDS faith milestones not yet captured
  if (isLDS && graph.faith?.milestones?.lds) {
    for (const [milestone, data] of Object.entries(graph.faith.milestones.lds as Record<string, Record<string, unknown>>)) {
      if (!data.captured) {
        threads.push({
          threadId: `faith_milestone:${milestone}`,
          questionType: 'faith_milestone',
          score: 22,
          description: `LDS milestone not yet captured: ${milestone}`,
        })
      }
    }
  }

  // Early-exploration mode — shapes the candidate pool
  // Person threads suppressed so they don't surface as options before entry 15
  if (graph.total_entries < 15) {
    for (const t of threads) {
      t.score *= t.threadId.startsWith('person:') ? 0.5 : 1.5
    }
  }

  // Small jitter — only for tie-breaking within the candidate pool
  for (const t of threads) {
    t.score += Math.random() * 3
  }

  // Default if graph is empty
  if (threads.length === 0) {
    return [{
      threadId: 'era:childhood',
      questionType: 'era',
      score: 10,
      description: 'Open the childhood chapter',
    }]
  }

  threads.sort((a, b) => b.score - a.score)
  return threads.slice(0, 5)
}

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
): Promise<{ pass: boolean; reason: string }> {
  try {
    const raw = await claudeComplete({
      system: QUALITY_CHECK_PROMPT + '\n\nReturn valid JSON only: {"pass": true/false, "reason": "..."}',
      user: `Person context: ${graphContext}\n\nQuestion to evaluate: "${question}"`,
      temperature: 0,
      maxTokens: 200,
    })
    return JSON.parse(raw)
  } catch {
    return { pass: false, reason: 'failed to parse quality check response' }
  }
}

// ─────────────────────────────────────────────────────────────
export const selectNextPrompt = inngest.createFunction(
  { id: 'select-next-prompt', retries: 3, triggers: [{ event: 'fireside/prompt.select' }] },
  async ({ event }: { event: SelectNextPromptEvent }) => {
    const { userId } = event.data
    const supabase = createServiceClient()

    // Load user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, display_name, cadence, onboarding_profile')
      .eq('id', userId)
      .single()

    if (userError || !user) throw new Error(`User not found: ${userId}`)

    // Load narrative graph
    const { data: narrativeRow } = await supabase
      .from('narratives')
      .select('graph, rolling_summary')
      .eq('user_id', userId)
      .single()

    const graph = (narrativeRow?.graph ?? {}) as NarrativeGraph

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

    // Synthesize fresh biographer notes right before generation — this is the only
    // place rolling_summary is actually needed, so we defer synthesis until here.
    if (graph.total_entries > 0) {
      const freshSummary = await synthesizeGraph(graph)
      graph.rolling_summary = freshSummary

      // Persist so chat-respond can use it as background context
      await supabase
        .from('narratives')
        .update({ rolling_summary: freshSummary, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    }

    // Scoring engine — returns top 5 candidates for Claude to choose from
    const candidates = selectTopThreads(graph)

    // Build generation prompt
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
Recent summary: ${graph.rolling_summary ?? 'No entries yet'}
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
      const raw = await claudeComplete({
        system: systemPrompt,
        user: attempt === 1
          ? taskInstruction
          : taskInstruction + '\n\nPrevious attempt failed. Return valid JSON only: {"selectedThreadId": "...", "questionType": "...", "question": "..."}',
        temperature: 0.6,
        maxTokens: 400,
      })

      try {
        const parsed = JSON.parse(raw)
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

      const check = await qualityCheck(question, graphContext)
      if (check.pass) break

      if (attempt === 2) {
        console.warn(`[select-next-prompt] Quality check failed after 2 attempts for user ${userId}: ${check.reason}`)
      }
    }

    if (!question) throw new Error('Failed to generate question')

    // Insert queued_prompt using Claude's actual selection
    const { data: qp, error: qpError } = await supabase
      .from('queued_prompts')
      .insert({
        user_id: userId,
        question,
        thread_id: selectedThreadId,
        question_type: selectedQuestionType,
        delivery_state: 'queued',
        model_used: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      })
      .select('id')
      .single()

    if (qpError || !qp) throw new Error(`Failed to insert queued_prompt: ${qpError?.message}`)

    // Update soft pointer on users
    await supabase
      .from('users')
      .update({ queued_prompt_id: qp.id })
      .eq('id', userId)

    // Schedule delivery based on cadence
    const CADENCE_DAYS: Record<string, number> = {
      daily: 1,
      few_per_week: 3,
      weekly: 7,
    }
    const deliverInDays = CADENCE_DAYS[user.cadence ?? 'weekly'] ?? 7
    const deliverAt = new Date()
    deliverAt.setDate(deliverAt.getDate() + deliverInDays)

    await inngest.send({
      name: 'fireside/prompt.deliver',
      data: { userId, queuedPromptId: qp.id },
      ts: deliverAt.getTime(),
    })

    return {
      userId,
      queuedPromptId: qp.id,
      threadId: selectedThreadId,
      questionType: selectedQuestionType,
      deliverAt: deliverAt.toISOString(),
    }
  }
)
