import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { claudeComplete, logTokenUsage, getClaudeClient, resolveApiKey, withUserKeyFallback } from '@/lib/ai'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { thread } = await request.json()
    if (!thread || typeof thread !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const service = createServiceClient()

    const [{ data: profile }, { data: narrative }] = await Promise.all([
      service.from('users').select('display_name').eq('id', user.id).single(),
      service.from('narratives').select('rolling_summary').eq('user_id', user.id).single(),
    ])

    const name = profile?.display_name ?? ''
    const summary = narrative?.rolling_summary ?? ''

    const { model: claudeModel } = getClaudeClient()
    const userApiKey = await resolveApiKey(user.id, service)
    const result = await withUserKeyFallback(user.id, service, userApiKey, (key) =>
      claudeComplete({
        system: `You are a thoughtful biographer opening a personal memoir conversation. \
The person has chosen a specific thread from their life to explore. \
Write ONE warm, specific opening question that invites them to tell this part of their story. \
One question only. Two sentences maximum. Do not start with "I". \
Feel like an invitation to share something real, not a form field.`,
        user: [
          name ? `Person's name: ${name}` : '',
          summary ? `Context about this person: ${summary}` : '',
          `Thread to explore: ${thread}`,
        ].filter(Boolean).join('\n'),
        maxTokens: 150,
        temperature: 0.7,
        apiKey: key,
      })
    )

    const trimmedQuestion = result.text.trim()

    const { data: conversation, error: convError } = await service
      .from('conversations')
      .insert({
        user_id: user.id,
        topic: trimmedQuestion,
        status: 'active',
        origin: 'user_initiated',
        channel: 'web',
      })
      .select('id')
      .single()

    if (convError || !conversation) {
      console.error('[revisit-thread] conversation insert error:', convError)
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    void logTokenUsage(service, {
      userId: user.id,
      conversationId: conversation.id,
      inngestFunction: 'revisit-thread',
      model: claudeModel,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      purpose: 'revisit thread opening question',
    })

    const { error: turnError } = await service
      .from('turns')
      .insert({
        conversation_id: conversation.id,
        user_id: user.id,
        role: 'biographer',
        content: encrypt(trimmedQuestion, process.env.MEMORY_ENCRYPTION_KEY!),
        channel: 'web',
        processed: true,
      })

    if (turnError) {
      console.error('[revisit-thread] turn insert error:', turnError)
      return NextResponse.json({ error: 'Failed to create biographer turn' }, { status: 500 })
    }

    await service
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', user.id)

    return NextResponse.json({ ok: true, conversationId: conversation.id })
  } catch (err) {
    console.error('[revisit-thread] unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
