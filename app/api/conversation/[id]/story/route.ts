import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { claudeComplete, logTokenUsage, getClaudeClient, resolveApiKey, withUserKeyFallback } from '@/lib/ai'
import { StoryGenerateSchema, StorySaveSchema } from '@/lib/schemas'

const INTENSITY_PROMPTS = {
  light: `Lightly reshape the following personal account into a journal entry. \
Preserve nearly all of the original wording and every specific detail. \
Add light narrative structure and smooth any rough transitions, but don't rewrite. \
Do not use em-dashes. \
Return only the journal entry. No commentary, no quotation marks, no markdown.`,

  medium: `Rewrite the following as a polished personal journal entry. \
Keep all facts and the author's distinctive voice, but rewrite for flow, narrative arc, and emotional clarity. \
Do not use em-dashes. \
Return only the journal entry. No commentary, no quotation marks, no markdown.`,

  full: `Ghost-write the following as a beautifully crafted memoir entry. \
Preserve every fact and the emotional truth of the story, but elevate the prose to feel like published personal narrative. \
The author's personality and specific details must shine through -- this should feel unmistakably like them, just at their best. \
Do not use em-dashes. \
Return only the memoir entry. No commentary, no quotation marks, no markdown.`,
}

const VOICE_STYLES: Record<string, string> = {
  mccullough: `Write in the style of David McCullough: sweeping, narrative warmth, accessible and patriotic in spirit, \
reading like a story that carries the reader forward naturally.`,
  goodwin: `Write in the style of Doris Kearns Goodwin: intimate and empathetic, attentive to inner life, \
family bonds, and the emotional texture of experience.`,
  caro: `Write in the style of Robert Caro: meticulous and detailed, reconstructing events with precision, \
attentive to place and power and the weight of small moments.`,
}

function buildFullPrompt(perspective: string, voice: string): string {
  let prompt = INTENSITY_PROMPTS.full
  if (perspective === 'third') {
    prompt += ` Write in third person, referring to the narrator as "they" or by name if one is mentioned.`
  }
  if (voice !== 'none' && VOICE_STYLES[voice]) {
    prompt += ` ${VOICE_STYLES[voice]}`
  }
  return prompt
}

// POST — generate story content at given intensity
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = StoryGenerateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { intensity, perspective, voice } = parsed.data

  const service = createServiceClient()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, status')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conversation.status !== 'settled') return NextResponse.json({ error: 'Conversation not settled' }, { status: 409 })

  let { data: entry } = await service
    .from('entries')
    .select('id')
    .eq('conversation_id', conversationId)
    .maybeSingle()

  // Create entry row on the fly for conversations settled before entry creation was wired up
  if (!entry) {
    const { data: created } = await service
      .from('entries')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        status: 'settled',
        origin: 'biographer',
        settled_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (!created) return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    entry = created
  }

  // Fetch and decrypt turns to use as source
  const { data: turns } = await service
    .from('turns')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .eq('is_synthetic', false)
    .order('created_at', { ascending: true })

  const sourceText = (turns ?? [])
    .map(t => {
      try {
        const decrypted = decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!)
        return t.role === 'user' ? `You: ${decrypted}` : `Biographer: ${decrypted}`
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .join('\n\n')

  const { model: claudeModel } = getClaudeClient()
  const userApiKey = await resolveApiKey(user.id, service)
  const { text: story, inputTokens, outputTokens } = await withUserKeyFallback(user.id, service, userApiKey, (key) =>
    claudeComplete({
      system: intensity === 'full' ? buildFullPrompt(perspective, voice) : INTENSITY_PROMPTS[intensity],
      user: sourceText,
      maxTokens: 3000,
      temperature: intensity === 'full' ? 0.8 : 0.6,
      apiKey: key,
    })
  )

  void logTokenUsage(service, {
    userId: user.id,
    conversationId,
    inngestFunction: 'story',
    model: claudeModel,
    inputTokens,
    outputTokens,
    purpose: 'story generation',
  })

  await service
    .from('entries')
    .update({ story_content: story, story_intensity: intensity })
    .eq('id', entry.id)

  return NextResponse.json({ content: story })
}

// PUT — save user-edited story content
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = StorySaveSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { content } = parsed.data

  const service = createServiceClient()

  const { data: entry } = await service
    .from('entries')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await service
    .from('entries')
    .update({ story_content: content })
    .eq('id', entry.id)

  return NextResponse.json({ ok: true })
}
