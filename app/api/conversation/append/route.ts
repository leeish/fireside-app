import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { inngest } from '@/inngest/client'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, responseText } = await request.json()
  if (!conversationId || !responseText?.trim()) {
    return NextResponse.json({ error: 'Missing conversationId or response' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify conversation belongs to this user
  const { data: conversation, error: convError } = await service
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const encryptedResponse = encrypt(responseText.trim(), process.env.MEMORY_ENCRYPTION_KEY!)

  const { data: turn, error: turnError } = await service
    .from('turns')
    .insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'user',
      content: encryptedResponse,
      channel: 'web',
      processed: false,
    })
    .select('id')
    .single()

  if (turnError || !turn) {
    console.error('[append] turn error:', turnError)
    return NextResponse.json({ error: 'Failed to save response' }, { status: 500 })
  }

  // Mark any active queued prompt as engaged
  await service
    .from('queued_prompts')
    .update({ delivery_state: 'engaged', engaged_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .in('delivery_state', ['queued', 'in_app_seen'])

  // Update last_active_at
  await service
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', user.id)

  // Fire enrichment
  try {
    await inngest.send({ name: 'fireside/entry.enrich', data: { turnId: turn.id } })
  } catch (err) {
    console.error('[append] inngest error:', err)
  }

  return NextResponse.json({ ok: true, turnId: turn.id })
}
