import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { inngest } from '@/inngest/client'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { responseText, topic } = await request.json()
  if (!responseText?.trim()) {
    return NextResponse.json({ error: 'Missing entry text' }, { status: 400 })
  }

  const service = createServiceClient()

  const topicLabel = (topic?.trim() || responseText.trim().slice(0, 80)).slice(0, 120)

  const { data: conversation, error: convError } = await service
    .from('conversations')
    .insert({
      user_id: user.id,
      topic: topicLabel,
      status: 'active',
      origin: 'user',
      channel: 'web',
      spine_completeness: 0,
    })
    .select('id')
    .single()

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }

  const { data: userTurn, error: userTurnError } = await service
    .from('turns')
    .insert({
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'user',
      content: encrypt(responseText.trim(), process.env.MEMORY_ENCRYPTION_KEY!),
      channel: 'web',
      processed: false,
    })
    .select('id')
    .single()

  if (userTurnError || !userTurn) {
    return NextResponse.json({ error: 'Failed to store entry' }, { status: 500 })
  }

  await service
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', user.id)

  // Intentionally does NOT touch queued_prompts — user chose to write freely
  try {
    await inngest.send({ name: 'fireside/entry.enrich', data: { turnId: userTurn.id } })
  } catch (err) {
    console.error('[free-entry] inngest error:', err)
  }

  return NextResponse.json({ ok: true, conversationId: conversation.id })
}
