import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { inngest } from '@/inngest/client'

// Used for in-app / web prompt submission (e.g. onboarding first prompt).
// Creates the conversation, biographer turn, and user turn, then triggers enrichment.

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { promptText, responseText, promptCategory } = await request.json()
  if (!promptText || !responseText?.trim()) {
    return NextResponse.json({ error: 'Missing prompt or response' }, { status: 400 })
  }

  const service = createServiceClient()

  // Create the conversation
  const { data: conversation, error: convError } = await service
    .from('conversations')
    .insert({
      user_id: user.id,
      topic: promptText,
      status: 'active',
      origin: 'biographer',
      channel: 'web',
      spine_completeness: 0,
    })
    .select('id')
    .single()

  if (convError || !conversation) {
    console.error('[submit] conversation error:', convError)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }

  // Biographer turn (the question — plaintext)
  const { error: bioTurnError } = await service
    .from('turns')
    .insert({
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'biographer',
      content: promptText,
      channel: 'web',
      processed: true,
    })

  if (bioTurnError) {
    console.error('[submit] biographer turn error:', bioTurnError)
    return NextResponse.json({ error: 'Failed to create biographer turn' }, { status: 500 })
  }

  // User turn (encrypted)
  const encryptedResponse = encrypt(responseText.trim(), process.env.MEMORY_ENCRYPTION_KEY!)

  const { data: userTurn, error: userTurnError } = await service
    .from('turns')
    .insert({
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'user',
      content: encryptedResponse,
      channel: 'web',
      processed: false,
    })
    .select('id')
    .single()

  if (userTurnError || !userTurn) {
    console.error('[submit] user turn error:', userTurnError)
    return NextResponse.json({ error: 'Failed to store response' }, { status: 500 })
  }

  // Mark any active queued_prompt as engaged
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
    await inngest.send({ name: 'fireside/entry.enrich', data: { turnId: userTurn.id } })
  } catch (err) {
    console.error('[submit] inngest error:', err)
  }

  return NextResponse.json({ ok: true, conversationId: conversation.id })
}
