import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { z } from 'zod'

const StartChatSchema = z.object({
  promptText: z.string().min(1),
  promptCategory: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = StartChatSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { promptText } = parsed.data

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
    })
    .select('id')
    .single()

  if (convError || !conversation) {
    console.error('[start-chat] conversation error:', convError)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }

  // Insert biographer turn (the prompt question) -- no user turn yet
  const { error: bioTurnError } = await service
    .from('turns')
    .insert({
      conversation_id: conversation.id,
      user_id: user.id,
      role: 'biographer',
      content: encrypt(promptText, process.env.MEMORY_ENCRYPTION_KEY!),
      channel: 'web',
      processed: true,
    })

  if (bioTurnError) {
    console.error('[start-chat] biographer turn error:', bioTurnError)
    return NextResponse.json({ error: 'Failed to create biographer turn' }, { status: 500 })
  }

  // Update last_active_at
  await service
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ conversationId: conversation.id })
}
