import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { getAIClient } from '@/lib/ai'

type FirstFollowupEvent = { data: { userId: string; turnId: string } }

// This runs only after the user's very first entry.
// Unlike select-next-prompt, it reads the actual entry and crafts a direct
// continuation — not a new topic. The goal is to make them feel heard immediately.

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

After the question, add one warm sentence making clear they can go their own direction if something else is sitting with them today. This must feel like a genuine invitation, not a formality.`

export const firstFollowup = inngest.createFunction(
  { id: 'first-followup', retries: 3, triggers: [{ event: 'fireside/prompt.first-followup' }] },
  async ({ event }: { event: FirstFollowupEvent }) => {
    const { userId, turnId } = event.data
    const supabase = createServiceClient()

    // Load the user's initial turn
    const { data: turn, error: turnError } = await supabase
      .from('turns')
      .select('id, conversation_id, content')
      .eq('id', turnId)
      .eq('user_id', userId)
      .eq('role', 'user')
      .single()

    if (turnError || !turn) throw new Error(`Turn not found: ${turnId}`)

    // Load the biographer's opening question
    const { data: bioTurns } = await supabase
      .from('turns')
      .select('content')
      .eq('conversation_id', turn.conversation_id)
      .eq('role', 'biographer')
      .order('created_at', { ascending: false })
      .limit(1)

    const questionText = bioTurns?.[0]?.content ?? ''
    const responseText = decrypt(turn.content, process.env.MEMORY_ENCRYPTION_KEY!)

    // Load user for cadence
    const { data: user } = await supabase
      .from('users')
      .select('id, cadence')
      .eq('id', userId)
      .single()

    if (!user) throw new Error(`User not found: ${userId}`)

    const { client, model } = getAIClient()

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      store: false,
      max_tokens: 200,
      messages: [
        { role: 'system', content: FIRST_FOLLOWUP_SYSTEM },
        {
          role: 'user',
          content: `The opening prompt they responded to: "${questionText}"\n\nTheir first entry:\n${responseText}\n\nWrite the follow-up question now.`,
        },
      ],
    })

    const question = completion.choices[0].message.content?.trim() ?? ''
    if (!question) throw new Error('Failed to generate first follow-up question')

    // Insert into queued_prompts
    const { data: qp, error: qpError } = await supabase
      .from('queued_prompts')
      .insert({
        user_id: userId,
        question,
        thread_id: 'first-followup',
        question_type: 'depth',
        delivery_state: 'queued',
        model_used: model,
      })
      .select('id')
      .single()

    if (qpError || !qp) throw new Error(`Failed to insert queued prompt: ${qpError?.message}`)

    // Update soft pointer on users
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

    return { userId, queuedPromptId: qp.id, deliverAt: deliverAt.toISOString() }
  }
)
