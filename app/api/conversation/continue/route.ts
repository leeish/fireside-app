import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await request.json()
  if (!conversationId) return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })

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

  // Resume the conversation
  await service
    .from('conversations')
    .update({ status: 'active' })
    .eq('id', conversationId)

  return NextResponse.json({ ok: true })
}
