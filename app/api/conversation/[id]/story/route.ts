import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { claudeComplete } from '@/lib/ai'

const INTENSITY_PROMPTS = {
  light: `Lightly reshape the following personal account into a journal entry. \
Preserve nearly all of the original wording and every specific detail. \
Add light narrative structure and smooth any rough transitions, but don't rewrite. \
Return only the journal entry. No commentary, no quotation marks, no markdown.`,

  medium: `Rewrite the following as a polished personal journal entry. \
Keep all facts and the author's distinctive voice, but rewrite for flow, narrative arc, and emotional clarity. \
Return only the journal entry. No commentary, no quotation marks, no markdown.`,

  full: `Ghost-write the following as a beautifully crafted memoir entry. \
Preserve every fact and the emotional truth of the story, but elevate the prose to feel like published personal narrative. \
The author's personality and specific details must shine through — this should feel unmistakably like them, just at their best. \
Return only the memoir entry. No commentary, no quotation marks, no markdown.`,
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

  const body = await req.json()
  const intensity: 'light' | 'medium' | 'full' = body.intensity ?? 'medium'
  if (!INTENSITY_PROMPTS[intensity]) {
    return NextResponse.json({ error: 'Invalid intensity' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, status')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conversation.status !== 'settled') return NextResponse.json({ error: 'Conversation not settled' }, { status: 409 })

  const { data: entry } = await service
    .from('entries')
    .select('id')
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (!entry) return NextResponse.json({ error: 'Entry not ready yet' }, { status: 404 })

  // Fetch and decrypt turns to use as source
  const { data: turns } = await service
    .from('turns')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  const sourceText = (turns ?? [])
    .map(t => {
      if (t.role === 'user') {
        try {
          const decrypted = decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!)
          return `You: ${decrypted}`
        } catch {
          return null
        }
      }
      return `Biographer: ${t.content}`
    })
    .filter(Boolean)
    .join('\n\n')

  const story = await claudeComplete({
    system: INTENSITY_PROMPTS[intensity],
    user: sourceText,
    maxTokens: 3000,
    temperature: intensity === 'full' ? 0.8 : 0.6,
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

  const { content } = await req.json()
  if (typeof content !== 'string') return NextResponse.json({ error: 'Missing content' }, { status: 400 })

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
