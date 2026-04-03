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
The source is a guided conversation: use the biographer's question as the thematic frame for the entry -- let it shape the opening and structure, but do not quote or reference it directly. \
Strip all conversational fillers and dialogue-only transitions (phrases like "there is one more thing", "anyway", "so", "well", "that's a good question", etc.) that would read awkwardly in prose. \
Keep all facts and the author's distinctive voice, but rewrite for flow, narrative arc, and emotional clarity. \
Do not use em-dashes. \
Return only the journal entry. No commentary, no quotation marks, no markdown.`,

  full: `Ghost-write the following as a beautifully crafted memoir entry. \
The source is a guided conversation: treat the biographer's question as the thematic anchor -- let it shape what the entry is about and how it opens, but do not quote or reference it directly. \
Strip all conversational fillers and dialogue-only transitions (phrases like "there is one more thing", "anyway", "so", "well", "that's a good question", etc.) that would read awkwardly in prose. \
Open with a narrative hook that reflects the question's theme, not a conversational opener. \
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

function buildSystemPrompt(
  intensity: string,
  perspective: string,
  voice: string,
  authorName: string | null,
  effectivePronouns: string | null,
): string {
  const nameLine = authorName ? `The person telling this story is ${authorName}. ` : ''
  let base = nameLine + INTENSITY_PROMPTS[intensity as keyof typeof INTENSITY_PROMPTS]

  if (intensity === 'full') {
    if (perspective === 'third') {
      if (authorName && effectivePronouns) {
        base += ` Write in third person, referring to ${authorName} using ${effectivePronouns}.`
      } else if (authorName) {
        base += ` Write in third person. Infer pronouns from how the author refers to themselves in the transcript; if unclear, use ${authorName}'s name rather than guessing.`
      } else {
        base += ` Write in third person. Infer pronouns from how the author refers to themselves in the transcript; if unclear, use their name rather than guessing.`
      }
    }
    if (voice !== 'none' && VOICE_STYLES[voice]) {
      base += ` ${VOICE_STYLES[voice]}`
    }
  }

  return base
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
  const { intensity, perspective, voice, pronouns: clientPronouns } = parsed.data

  const service = createServiceClient()

  const { data: userProfile } = await service
    .from('users')
    .select('display_name, pronouns')
    .eq('id', user.id)
    .single()

  const authorName = userProfile?.display_name ?? null
  const effectivePronouns = clientPronouns ?? userProfile?.pronouns ?? null

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
    .select('id, story_content, story_intensity')
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
      .select('id, story_content, story_intensity')
      .single()
    if (!created) return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    entry = created
  }

  const resolvedEntry = entry!

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
      system: buildSystemPrompt(intensity, perspective, voice, authorName, effectivePronouns),
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

  // Archive current story before overwriting
  if (resolvedEntry.story_content) {
    await service.from('story_versions').insert({
      entry_id: resolvedEntry.id,
      content: resolvedEntry.story_content,
      intensity: resolvedEntry.story_intensity ?? null,
      perspective,
      voice,
    })
    // Keep only the 5 most recent versions
    const { data: oldVersions } = await service
      .from('story_versions')
      .select('id')
      .eq('entry_id', resolvedEntry.id)
      .order('created_at', { ascending: false })
      .range(5, 1000)
    if (oldVersions && oldVersions.length > 0) {
      await service
        .from('story_versions')
        .delete()
        .in('id', oldVersions.map(v => v.id))
    }
  }

  await service
    .from('entries')
    .update({ story_content: story, story_intensity: intensity })
    .eq('id', resolvedEntry.id)

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
