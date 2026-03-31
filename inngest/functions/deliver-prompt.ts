import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { sendPrompt } from '@/lib/email'
import { selectNextPrompt } from './select-next-prompt'

type DeliverPromptEvent = {
  data: {
    userId: string
  }
}

export const deliverPrompt = inngest.createFunction(
  { id: 'deliver-prompt', retries: 3, triggers: [{ event: 'fireside/prompt.deliver' }] },
  async ({ event, step }: { event: DeliverPromptEvent; step: any }) => {
    const { userId } = event.data
    const supabase = createServiceClient()

    // Don't send if another prompt is already awaiting a response
    const { data: inFlight } = await supabase
      .from('queued_prompts')
      .select('id')
      .eq('user_id', userId)
      .eq('delivery_state', 'email_sent')
      .limit(1)
      .maybeSingle()

    if (inFlight) return { skipped: 'another prompt is already awaiting a response' }

    // Load user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, display_name')
      .eq('id', userId)
      .single()

    if (userError || !user) throw new Error(`User not found: ${userId}`)

    // Find the first open prompt (queued or seen in-app but not yet answered)
    const { data: openPrompt } = await supabase
      .from('queued_prompts')
      .select('id, question, question_type, delivery_state')
      .eq('user_id', userId)
      .in('delivery_state', ['queued', 'in_app_seen'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    let qp = openPrompt

    // Fallback: no open prompts — generate a fresh one now (skip scheduling a new delivery)
    if (!qp) {
      const result = await step.invoke('generate-fresh-prompt', {
        function: selectNextPrompt,
        data: { userId, skipScheduling: true },
      })

      const { data: freshPrompt, error: freshError } = await supabase
        .from('queued_prompts')
        .select('id, question, question_type, delivery_state')
        .eq('id', result.queuedPromptId)
        .single()

      if (freshError || !freshPrompt) throw new Error(`Failed to load fresh prompt: ${freshError?.message}`)
      qp = freshPrompt
    }

    // Create the conversation for this delivery
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        topic: qp.question,
        status: 'active',
        origin: 'biographer',
        channel: 'email',
        spine_completeness: 0,
        queued_prompt_id: qp.id,
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
      userId,
    })

    // Mark queued prompt as email_sent
    await supabase
      .from('queued_prompts')
      .update({ delivery_state: 'email_sent', email_sent_at: new Date().toISOString() })
      .eq('id', qp.id)

    return { conversationId: conversation.id, queuedPromptId: qp.id }
  }
)
