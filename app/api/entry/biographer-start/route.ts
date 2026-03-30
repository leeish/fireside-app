import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { claudeComplete, logTokenUsage, getClaudeClient } from '@/lib/ai'
import { BiographerStartSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = BiographerStartSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { topic } = parsed.data

  const service = createServiceClient()

  // Load user name for a personal touch
  const { data: profile } = await service
    .from('users')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const name = profile?.display_name ?? ''

  const { model: claudeModel } = getClaudeClient()
  const result = await claudeComplete({
    system: `You are a thoughtful biographer opening a personal memoir conversation on a topic the person has chosen. \
Write ONE warm, specific opening question that invites them to start telling their story. \
One question only. Two sentences maximum. Do not start with "I". \
Feel like an invitation to share something real, not a form field or interview prompt.`,
    user: `${name ? `Person's name: ${name}\n` : ''}Topic they want to explore: ${topic}`,
    maxTokens: 150,
    temperature: 0.7,
  })

  const trimmedQuestion = result.text.trim()

  const { data: conversation, error: convError } = await service
    .from('conversations')
    .insert({
      user_id: user.id,
      topic: trimmedQuestion,
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

  void logTokenUsage(service, {
    userId: user.id,
    conversationId: conversation.id,
    inngestFunction: 'biographer-start',
    model: claudeModel,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    purpose: 'biographer opening question',
  })

  const { error: turnError } = await service
    .from('turns')
    .insert({
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'biographer',
      content: trimmedQuestion,
      channel: 'web',
      processed: true,
    })

  if (turnError) {
    return NextResponse.json({ error: 'Failed to create biographer turn' }, { status: 500 })
  }

  await service
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ ok: true, conversationId: conversation.id })
}
