import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { inngest } from '@/inngest/client'
import { ConversationChatSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ConversationChatSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { conversationId, responseText } = parsed.data

  const service = createServiceClient()

  // Verify conversation belongs to this user and is still active
  const { data: conversation } = await service
    .from('conversations')
    .select('id, status')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conversation.status === 'settled') {
    return NextResponse.json({ error: 'Conversation is settled' }, { status: 409 })
  }

  // Save user turn (encrypted)
  const encrypted = encrypt(responseText, process.env.MEMORY_ENCRYPTION_KEY!)

  const { data: turn, error: turnError } = await service
    .from('turns')
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'user',
      content: encrypted,
      channel: 'app',
      processed: false,
    })
    .select('id')
    .single()

  if (turnError || !turn) {
    return NextResponse.json({ error: 'Failed to save turn' }, { status: 500 })
  }

  // Update last_active_at
  await service
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', user.id)

  // Fire chat.respond — AI will generate a follow-up immediately
  await inngest.send({
    name: 'fireside/chat.respond',
    data: { conversationId, userId: user.id },
  })

  return NextResponse.json({ ok: true, turnId: turn.id })
}
