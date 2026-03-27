import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { getAIClient } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/craft-system'
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
function selectThread(graph: NarrativeGraph): ScoredThread {
  const threads: ScoredThread[] = []
  const lastWeight = graph.last_entry_weight ?? 'medium'
  const isLDS = graph.faith?.tradition === 'lds'

  // Score uncaptured / thin eras
  for (const era of KNOWN_ERAS) {
    const eraData = graph.eras[era]
    let score = 0
    if (!eraData || eraData.entries === 0) score = 20
    else if (eraData.richness === 'low') score = 10
    else if (eraData.richness === 'medium') score = 5

    if (era === 'mission' && isLDS) score += 15
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

  // Lightness after heavy entry
  if (lastWeight === 'heavy') {
    threads.push({
      threadId: 'lightness',
      questionType: 'lightness',
      score: 28,
      description: 'Shift to something warm or funny after a heavy entry',
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

  // Default if graph is empty
  if (threads.length === 0) {
    return {
      threadId: 'era:childhood',
      questionType: 'era',
      score: 10,
      description: 'Open the childhood chapter',
    }
  }

  threads.sort((a, b) => b.score - a.score)
  return threads[0]
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
  client: ReturnType<typeof getAIClient>['client'],
  model: string,
): Promise<{ pass: boolean; reason: string }> {
  const result = await client.chat.completions.create({
    model,
    temperature: 0,
    store: false,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: QUALITY_CHECK_PROMPT },
      { role: 'user', content: `Person context: ${graphContext}\n\nQuestion to evaluate: "${question}"` },
    ],
  })
  try {
    return JSON.parse(result.choices[0].message.content ?? '{"pass":false,"reason":"parse error"}')
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

    // Decision engine
    const selected = selectThread(graph)

    // Build generation prompt
    const systemPrompt = buildSystemPrompt(graph)

    const graphContext = `
Name: ${graph.display_name ?? 'Unknown'}
Total entries: ${graph.total_entries}
Eras covered: ${JSON.stringify(graph.eras)}
People: ${JSON.stringify(Object.keys(graph.people ?? {}))}
Themes: ${(graph.themes ?? []).join(', ')}
Deflections: ${(graph.deflections ?? []).join('; ')}
Last entry weight: ${graph.last_entry_weight ?? 'unknown'}
Faith: ${JSON.stringify(graph.faith)}
Recent summary: ${graph.rolling_summary ?? 'No entries yet'}
`.trim()

    const taskInstruction = `
Graph context:
${graphContext}

Task: Write ONE ${selected.questionType} question.
Thread to address: ${selected.description}
This is a Zone 1 email prompt — include the open door sentence.
`.trim()

    const { client, model } = getAIClient()

    // Generate question (up to 2 attempts)
    let question = ''
    for (let attempt = 1; attempt <= 2; attempt++) {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.7,
        store: false,
        max_tokens: 200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: attempt === 1 ? taskInstruction : taskInstruction + '\n\nPrevious attempt failed quality check. Write a better version.' },
        ],
      })

      question = completion.choices[0].message.content?.trim() ?? ''

      const check = await qualityCheck(question, graphContext, client, model)
      if (check.pass) break

      if (attempt === 2) {
        // Accept anyway rather than blocking the pipeline — log for review
        console.warn(`[select-next-prompt] Quality check failed after 2 attempts for user ${userId}: ${check.reason}`)
      }
    }

    if (!question) throw new Error('Failed to generate question')

    // Insert queued_prompt
    const { data: qp, error: qpError } = await supabase
      .from('queued_prompts')
      .insert({
        user_id: userId,
        question,
        thread_id: selected.threadId,
        question_type: selected.questionType,
        delivery_state: 'queued',
        model_used: model,
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
      threadId: selected.threadId,
      questionType: selected.questionType,
      deliverAt: deliverAt.toISOString(),
    }
  }
)
