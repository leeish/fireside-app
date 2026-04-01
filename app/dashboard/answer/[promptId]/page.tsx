import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'

// Creates (or finds) the conversation for a queued prompt and redirects to it.
// This handles the in-app "Answer" flow where no conversation exists yet.

export const dynamic = 'force-dynamic'

export default async function AnswerPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: qp } = await service
    .from('queued_prompts')
    .select('id, question, delivery_state')
    .eq('id', promptId)
    .eq('user_id', user.id)
    .single()

  if (!qp) redirect('/dashboard')

  // Always check for an existing active conversation for this prompt before creating a new one.
  // This prevents duplicates regardless of delivery_state, and avoids redirecting into archived conversations.
  const { data: existing } = await service
    .from('conversations')
    .select('id')
    .eq('user_id', user.id)
    .eq('topic', qp.question)
    .neq('status', 'archived')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) redirect(`/dashboard/conversation/${existing.id}`)

  // Create a fresh conversation for this prompt
  const { data: conversation } = await service
    .from('conversations')
    .insert({
      user_id: user.id,
      topic: qp.question,
      status: 'active',
      origin: 'biographer',
      channel: 'app',
      queued_prompt_id: promptId,
    })
    .select('id')
    .single()

  if (!conversation) redirect('/dashboard')

  // Add the prompt as the opening biographer turn
  await service.from('turns').insert({
    conversation_id: conversation.id,
    user_id: user.id,
    role: 'biographer',
    content: encrypt(qp.question, process.env.MEMORY_ENCRYPTION_KEY!),
    channel: 'app',
    processed: true,
  })

  // Mark as seen in-app
  await service
    .from('queued_prompts')
    .update({ delivery_state: 'in_app_seen' })
    .eq('id', qp.id)

  redirect(`/dashboard/conversation/${conversation.id}`)
}
