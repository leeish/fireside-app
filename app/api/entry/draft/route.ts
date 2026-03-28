import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { inngest } from '@/inngest/client'

// POST   — create a new draft conversation + user turn (no enrichment)
// PATCH  — update existing draft turn content; pass publish:true to also fire enrichment

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { responseText, topic } = await request.json()
  if (!responseText?.trim()) return NextResponse.json({ error: 'Missing text' }, { status: 400 })

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

  const { data: turn, error: turnError } = await service
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

  if (turnError || !turn) {
    return NextResponse.json({ error: 'Failed to store draft' }, { status: 500 })
  }

  await service.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', user.id)

  return NextResponse.json({ conversationId: conversation.id, turnId: turn.id })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, responseText, publish } = await request.json()
  if (!conversationId || !responseText?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify ownership
  const { data: conversation } = await service
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find the user turn to update
  const { data: turn } = await service
    .from('turns')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!turn) return NextResponse.json({ error: 'Turn not found' }, { status: 404 })

  await service
    .from('turns')
    .update({ content: encrypt(responseText.trim(), process.env.MEMORY_ENCRYPTION_KEY!) })
    .eq('id', turn.id)

  if (publish) {
    try {
      await inngest.send({ name: 'fireside/entry.enrich', data: { turnId: turn.id } })
    } catch (err) {
      console.error('[draft] inngest error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
