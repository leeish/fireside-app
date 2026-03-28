import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { claudeComplete } from '@/lib/ai'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, status')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conversation.status !== 'settled') return NextResponse.json({ error: 'Not settled' }, { status: 409 })

  const { data: turns } = await service
    .from('turns')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  const decryptedTurns = (turns ?? []).map(t => ({
    role: t.role,
    content: t.role === 'user'
      ? (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })()
      : t.content,
  })).filter(t => t.content)

  const transcript = decryptedTurns
    .map(t => t.role === 'biographer' ? `Q: ${t.content}` : `A: ${t.content}`)
    .join('\n\n')

  const title = await claudeComplete({
    system: `You write short, evocative titles for personal memoir entries — like chapter titles in a memoir. \
Given a conversation transcript, return a single title of 3–8 words that captures the emotional core or subject. \
No punctuation at the end. No quotes. No explanation. Just the title.`,
    user: transcript,
    maxTokens: 30,
    temperature: 0.7,
  })

  const trimmedTitle = title.trim()

  await service
    .from('conversations')
    .update({ topic: trimmedTitle })
    .eq('id', conversationId)

  return NextResponse.json({ title: trimmedTitle })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const { title } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  await service
    .from('conversations')
    .update({ topic: title.trim() })
    .eq('id', conversationId)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
