import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPrompt } from '@/lib/email'

type DeliverPromptEvent = {
  data: {
    userId: string
    queuedPromptId: string
  }
}

export const deliverPrompt = inngest.createFunction(
  { id: 'deliver-prompt', retries: 3, triggers: [{ event: 'fireside/prompt.deliver' }] },
  async ({ event }: { event: DeliverPromptEvent }) => {
    const { userId, queuedPromptId } = event.data
    const supabase = createServiceClient()

    // Load the queued prompt
    const { data: qp, error: qpError } = await supabase
      .from('queued_prompts')
      .select('id, question, question_type, delivery_state')
      .eq('id', queuedPromptId)
      .eq('user_id', userId)
      .single()

    if (qpError || !qp) throw new Error(`Queued prompt not found: ${queuedPromptId}`)
    if (qp.delivery_state === 'complete') return { skipped: 'already complete' }

    // Don't send if another prompt is already awaiting a response
    const { data: inFlight } = await supabase
      .from('queued_prompts')
      .select('id')
      .eq('user_id', userId)
      .eq('delivery_state', 'email_sent')
      .neq('id', queuedPromptId)
      .limit(1)
      .maybeSingle()

    if (inFlight) return { skipped: 'another prompt is already awaiting a response' }

    // Load user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, display_name, last_active_at')
      .eq('id', userId)
      .single()

    if (userError || !user) throw new Error(`User not found: ${userId}`)

    // Hold rule: if user was active in the last 6 hours, skip email this cycle
    if (user.last_active_at) {
      const lastActive = new Date(user.last_active_at).getTime()
      const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
      if (lastActive > sixHoursAgo) {
        return { skipped: 'user recently active — holding email' }
      }
    }

    // Create the conversation for this delivery
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        topic: qp.question.slice(0, 120),
        status: 'active',
        origin: 'biographer',
        channel: 'email',
        spine_completeness: 0,
      })
      .select('id')
      .single()

    if (convError || !conversation) throw new Error(`Failed to create conversation: ${convError?.message}`)

    // Create the biographer turn (the question)
    const { error: turnError } = await supabase
      .from('turns')
      .insert({
        conversation_id: conversation.id,
        user_id: userId,
        role: 'biographer',
        content: qp.question,
        channel: 'email',
        processed: true,  // biographer turns don't need extraction
      })

    if (turnError) throw new Error(`Failed to create biographer turn: ${turnError.message}`)

    // Send the email — reply-to encodes the conversation ID for inbound routing
    await sendPrompt({
      to: user.email,
      userName: user.display_name ?? user.email,
      promptText: qp.question,
      conversationId: conversation.id,
    })

    // Mark queued prompt as email_sent
    await supabase
      .from('queued_prompts')
      .update({ delivery_state: 'email_sent', email_sent_at: new Date().toISOString() })
      .eq('id', queuedPromptId)

    return { conversationId: conversation.id, queuedPromptId }
  }
)
