import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { claudeComplete } from '@/lib/ai'

type FirstFollowupEvent = { data: { userId: string; turnId: string } }

// This runs only after the user's very first entry.
// Unlike select-next-prompt, it reads the actual entry and crafts a direct
// continuation — not a new topic. The goal is to make them feel heard immediately.
//
// Process: generate 3 candidates in parallel, then run a selection pass
// that picks the one most likely to create a "magical" first impression.

const FIRST_FOLLOWUP_SYSTEM = `You are a thoughtful biographer reading someone's very first entry. This is the first thing they have ever shared with you.

Your job: write ONE follow-up question that makes them feel — this biographer actually read what I wrote and found the most interesting part.

The question must be grounded in something specific they wrote: a name, a place, a detail, a moment, a passing reference. It should pull on one thread that was touched but not fully explored.

This question sets the tone for the entire relationship. It cannot be generic. It cannot feel like a product prompt. It must feel like it came from someone paying close attention to them specifically.

HARD RULES:
- One question only. Never two.
- Never start with "I".
- Three sentences maximum — usually one or two is better.
- Must reference something specific from their entry.
- Do not ask about anything they did not mention.
- Self-contained. The person will read this a day after writing their entry — do not assume they remember what they wrote. Weave the relevant context into the question itself. Clarity over brevity.

After the question, add one warm sentence making clear they can go their own direction if something else is sitting with them today. This must feel like a genuine invitation, not a formality.`

const SELECTOR_SYSTEM = `You are evaluating three candidate follow-up questions for a personal biography app. A user wrote their very first entry and these questions were generated as potential follow-ups.

Your job: pick the single best question based on these criteria, in order of priority:

1. ENGAGEMENT - Which question is this specific person most likely to actually want to answer? Consider what they revealed about themselves, what they seem to care about, and what threads they left open.
2. MAGIC - Which question would make them think "how did it know to ask that?" — the feeling that something genuinely read and understood what they wrote, not a generic prompt.
3. DEPTH - Which question is most likely to produce a meaningful, specific memory rather than a surface-level answer.

Return JSON only: { "selected": 0, "reason": "one sentence" }
where "selected" is the index (0, 1, or 2) of the best question.`

export const firstFollowup = inngest.createFunction(
  { id: 'first-followup', retries: 3, triggers: [{ event: 'fireside/prompt.first-followup' }] },
  async ({ event }: { event: FirstFollowupEvent }) => {
    const { userId, turnId } = event.data
    const supabase = createServiceClient()

    const { data: turn, error: turnError } = await supabase
      .from('turns')
      .select('id, conversation_id, content')
      .eq('id', turnId)
      .eq('user_id', userId)
      .eq('role', 'user')
      .single()

    if (turnError || !turn) throw new Error(`Turn not found: ${turnId}`)

    const { data: bioTurns } = await supabase
      .from('turns')
      .select('content')
      .eq('conversation_id', turn.conversation_id)
      .eq('role', 'biographer')
      .order('created_at', { ascending: false })
      .limit(1)

    const questionText = bioTurns?.[0]?.content ?? ''
    const responseText = decrypt(turn.content, process.env.MEMORY_ENCRYPTION_KEY!)

    const { data: user } = await supabase
      .from('users')
      .select('id, cadence')
      .eq('id', userId)
      .single()

    if (!user) throw new Error(`User not found: ${userId}`)

    const userContent = `The opening prompt they responded to: "${questionText}"\n\nTheir first entry:\n${responseText}\n\nWrite the follow-up question now.`

    // Generate 3 candidates in parallel using Claude
    const [c1, c2, c3] = await Promise.all([
      claudeComplete({ system: FIRST_FOLLOWUP_SYSTEM, user: userContent, temperature: 0.8, maxTokens: 300 }),
      claudeComplete({ system: FIRST_FOLLOWUP_SYSTEM, user: userContent, temperature: 0.8, maxTokens: 300 }),
      claudeComplete({ system: FIRST_FOLLOWUP_SYSTEM, user: userContent, temperature: 0.8, maxTokens: 300 }),
    ])

    const candidates = [c1, c2, c3].filter(Boolean)
    if (candidates.length === 0) throw new Error('Failed to generate any candidate questions')

    // Selection pass — pick the best one
    let question = candidates[0]

    if (candidates.length > 1) {
      try {
        const raw = await claudeComplete({
          system: SELECTOR_SYSTEM + '\n\nReturn valid JSON only.',
          user: `User's first entry:\n${responseText}\n\nCandidates:\n0: ${candidates[0]}\n\n1: ${candidates[1]}\n\n2: ${candidates[2] ?? '(none)'}`,
          temperature: 0,
          maxTokens: 200,
        })
        const parsed = JSON.parse(raw)
        const idx = Number(parsed.selected)
        if (candidates[idx]) question = candidates[idx]
      } catch {
        // Fall back to first candidate
      }
    }

    const { data: qp, error: qpError } = await supabase
      .from('queued_prompts')
      .insert({
        user_id: userId,
        question,
        thread_id: 'first-followup',
        question_type: 'depth',
        delivery_state: 'queued',
        model_used: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      })
      .select('id')
      .single()

    if (qpError || !qp) throw new Error(`Failed to insert queued prompt: ${qpError?.message}`)

    await supabase
      .from('users')
      .update({ queued_prompt_id: qp.id })
      .eq('id', userId)

    // First follow-up always delivers in 1 day regardless of cadence
    const deliverAt = new Date()
    deliverAt.setDate(deliverAt.getDate() + 1)

    await inngest.send({
      name: 'fireside/prompt.deliver',
      data: { userId, queuedPromptId: qp.id },
      ts: deliverAt.getTime(),
    })

    return { userId, queuedPromptId: qp.id, deliverAt: deliverAt.toISOString(), candidates: candidates.length }
  }
)
