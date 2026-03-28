import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { getAIClient } from '@/lib/ai'

const STYLE_INSTRUCTIONS: Record<string, string> = {
  evocative: 'Evocative and emotional — captures the heart of the memory with feeling.',
  witty:     'Witty and clever — a light touch of wordplay or dry humor that fits the story.',
  playful:   'Playful and warm — fun, approachable, like something you\'d say to a friend.',
  poetic:    'Poetic and lyrical — uses imagery or metaphor to give the title a timeless feel.',
  simple:    'Simple and direct — plain language, no flourish, just what it\'s about.',
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const body = await req.json().catch(() => ({}))
  const style: string = body.style ?? 'evocative'

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

  const styleNote = STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS.evocative

  const { client, model } = getAIClient()
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.8,
    max_tokens: 50,
    messages: [
      {
        role: 'system',
        content: `You write titles for personal memoir entries — like chapter titles in a book. \
Return a single title of 5–10 words. Style: ${styleNote} \
No punctuation at the end. No quotes. No explanation. Just the title.`,
      },
      { role: 'user', content: transcript },
    ],
  })

  const trimmedTitle = (completion.choices[0].message.content ?? '').trim()

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
