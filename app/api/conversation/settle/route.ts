import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'
import { ConversationSettleSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ConversationSettleSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { conversationId } = parsed.data

  const service = createServiceClient()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, status')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conversation.status !== 'wrap_offered') {
    return NextResponse.json({ error: 'Conversation is not in wrap_offered state' }, { status: 409 })
  }

  // Settle the conversation
  await service
    .from('conversations')
    .update({ status: 'settled' })
    .eq('id', conversationId)

  // Mark the engaged prompt as complete
  await service
    .from('queued_prompts')
    .update({ delivery_state: 'complete' })
    .eq('user_id', user.id)
    .eq('delivery_state', 'engaged')

  // Run full transcript extraction and queue next prompt
  await inngest.send({
    name: 'fireside/chat.settle',
    data: { conversationId, userId: user.id },
  })

  return NextResponse.json({ ok: true })
}
