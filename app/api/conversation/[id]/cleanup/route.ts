import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { claudeComplete } from '@/lib/ai'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const body = await req.json().catch(() => ({}))
  const force = body.force === true

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, channel, status')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conversation.status !== 'settled') return NextResponse.json({ error: 'Conversation not settled' }, { status: 409 })

  const { data: entry } = await service
    .from('entries')
    .select('id, cleaned_content')
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (!entry) return NextResponse.json({ error: 'Entry not ready yet' }, { status: 404 })

  // Return cached result unless force-regenerating
  if (entry.cleaned_content && !force) {
    return NextResponse.json({ content: entry.cleaned_content })
  }

  // Fetch and decrypt turns
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

  const isEmail = conversation.channel === 'email'

  let sourceText: string
  let systemPrompt: string

  if (isEmail) {
    sourceText = decryptedTurns
      .filter(t => t.role === 'user')
      .map(t => t.content)
      .join('\n\n')

    systemPrompt = `You are a careful copy editor reviewing a personal journaling response sent by email. \
Clean it up: fix spelling and grammar, remove filler words and verbal tics, and break into readable paragraphs. \
Do not change any facts, meaningful word choices, or the author's voice — this is their story in their words. \
Return only the cleaned text. No commentary, no quotation marks, no markdown.`
  } else {
    sourceText = decryptedTurns
      .map(t => t.role === 'biographer' ? `Biographer: ${t.content}` : `You: ${t.content}`)
      .join('\n\n')

    systemPrompt = `Below is a conversation between a biographer (asking questions) and a person sharing their memories. \
Rewrite this as flowing first-person prose from the storyteller's perspective. \
Remove the biographer's questions and weave the person's answers together naturally. \
Keep the storyteller's exact phrases and specific details intact. Do not add or invent anything. \
Return only the written account. No commentary, no quotation marks, no markdown.`
  }

  const cleaned = await claudeComplete({
    system: systemPrompt,
    user: sourceText,
    maxTokens: 2048,
    temperature: 0.4,
  })

  await service
    .from('entries')
    .update({ cleaned_content: cleaned })
    .eq('id', entry.id)

  return NextResponse.json({ content: cleaned })
}
