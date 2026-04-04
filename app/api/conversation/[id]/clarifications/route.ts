import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { applyGraphPatch, normalizeGraph, emptyGraph, findEntryGaps, type NarrativeGraph, type ExtractionResult } from '@/lib/graph'
import { decrypt, encrypt } from '@/lib/crypto'
import { claudeComplete, getAIClient, resolveApiKey, withUserKeyFallback } from '@/lib/ai'
import { ENTRY_EXTRACTION_SYSTEM } from '@/lib/extraction'
import { ClarificationAnswerSchema } from '@/lib/schemas'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify conversation belongs to user
  const { data: conversation } = await service
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get pending clarifications for this conversation
  const { data: clarifications } = await service
    .from('clarifications')
    .select('id, entity_type, entity_key, field, question, status, answer')
    .eq('conversation_id', conversationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  return NextResponse.json({ clarifications: clarifications ?? [] })
}

// POST — scan the entry for gaps and generate clarifying questions
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify conversation belongs to user
  const { data: conversation } = await service
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Load entry for this conversation
  const { data: entry } = await service
    .from('entries')
    .select('id, entry_context')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  let entryContext: ExtractionResult | null = null

  if (entry.entry_context) {
    try {
      entryContext = JSON.parse(decrypt(entry.entry_context, process.env.MEMORY_ENCRYPTION_KEY!))
    } catch {
      entryContext = null
    }
  }

  // If no entry_context (old entry), re-extract from conversation turns
  if (!entryContext) {
    const { data: turns } = await service
      .from('turns')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('is_synthetic', false)
      .order('created_at', { ascending: true })

    const decryptedTurns = (turns ?? []).map(t => ({
      role: t.role,
      content: (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })(),
    })).filter(t => t.content)

    const questionText = decryptedTurns.find(t => t.role === 'biographer')?.content ?? ''
    const responseText = decryptedTurns.find(t => t.role === 'user')?.content ?? ''

    if (responseText) {
      const { client, model } = getAIClient()
      const completion = await client.chat.completions.create({
        model,
        temperature: 0,
        store: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ENTRY_EXTRACTION_SYSTEM },
          { role: 'user', content: `Question asked: ${questionText}\n\nUser's response: ${responseText}` },
        ],
      })
      try {
        entryContext = JSON.parse(completion.choices[0].message.content ?? '{}')
      } catch {
        entryContext = null
      }

      // Save for future scans
      if (entryContext) {
        await service
          .from('entries')
          .update({ entry_context: encrypt(JSON.stringify(entryContext), process.env.MEMORY_ENCRYPTION_KEY!) })
          .eq('id', entry.id)
      }
    }
  }

  if (!entryContext) {
    return NextResponse.json({ clarifications: [] })
  }

  // Load master graph
  const { data: narrativeRow } = await service
    .from('narratives')
    .select('graph')
    .eq('user_id', user.id)
    .single()

  const graph: NarrativeGraph = narrativeRow?.graph
    ? normalizeGraph(JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!)))
    : emptyGraph()

  // Find entry-specific gaps
  const gaps = findEntryGaps(entryContext, graph)
  if (gaps.length === 0) return NextResponse.json({ clarifications: [] })

  // Deduplicate against existing clarifications
  const { data: existing } = await service
    .from('clarifications')
    .select('entity_type, entity_key, field')
    .eq('conversation_id', conversationId)
    .in('status', ['pending', 'answered'])
  const existingSet = new Set(
    (existing ?? []).map(r => `${r.entity_type}:${r.entity_key}:${r.field}`)
  )
  const newGaps = gaps.filter(g => !existingSet.has(`${g.entity_type}:${g.entity_key}:${g.field}`))
  if (newGaps.length === 0) return NextResponse.json({ clarifications: [] })

  // Generate natural-language questions via Claude
  const summaryLine = entryContext.one_line_summary ? `Entry: ${entryContext.one_line_summary}\n\n` : ''
  const gapList = newGaps.map(g => `${g.entity_type} "${g.entity_key}" — missing: ${g.field}`).join('\n')

  const userApiKey = await resolveApiKey(user.id, service)
  let questions: string[] = newGaps.map(g => g.question)

  try {
    const { text } = await withUserKeyFallback(user.id, service, userApiKey, (key) =>
      claudeComplete({
        system: `You are generating clarifying questions for a personal journal entry. Given a list of data gaps, write natural, conversational questions that feel like a warm follow-up from a biographer.

Rules:
- Group related unknowns into one question when possible (e.g. multiple unknown people → one question)
- Questions must feel warm and specific, not like database field prompts
- Maximum 4 questions total
- Return a JSON array of strings: ["question 1", "question 2", ...]
- No preamble. Only the JSON array.`,
        user: `${summaryLine}Gaps to address:\n${gapList}`,
        maxTokens: 500,
        temperature: 0.4,
        apiKey: key,
      })
    )
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed) && parsed.length > 0) questions = parsed
  } catch {
    // Fall back to template questions
  }

  // Insert new clarifications, one per gap (paired with generated questions)
  const toInsert = newGaps.slice(0, questions.length).map((gap, i) => ({
    user_id: user.id,
    conversation_id: conversationId,
    entity_type: gap.entity_type,
    entity_key: gap.entity_key,
    field: gap.field,
    question: questions[i] ?? gap.question,
    status: 'pending',
  }))

  const { data: inserted, error: insertError } = await service
    .from('clarifications')
    .insert(toInsert)
    .select('id, entity_type, entity_key, field, question, status, answer')

  if (insertError) {
    console.error('[clarifications/scan] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create clarifications' }, { status: 500 })
  }

  return NextResponse.json({ clarifications: inserted ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params

  const parsed = ClarificationAnswerSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { clarificationId, answer } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify conversation belongs to user
  const { data: conversation } = await service
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get the clarification
  const { data: clarification } = await service
    .from('clarifications')
    .select('*')
    .eq('id', clarificationId)
    .eq('conversation_id', conversationId)
    .single()

  if (!clarification) return NextResponse.json({ error: 'Clarification not found' }, { status: 404 })

  // Mark clarification as answered
  const now = new Date().toISOString()
  await service
    .from('clarifications')
    .update({ status: 'answered', answer, answered_at: now })
    .eq('id', clarificationId)

  // Load user's narrative graph and apply patch
  const { data: narrativeRow } = await service
    .from('narratives')
    .select('graph, graph_version')
    .eq('user_id', user.id)
    .single()

  const currentGraph: NarrativeGraph = narrativeRow?.graph
    ? normalizeGraph(JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!)))
    : emptyGraph()
  const updatedGraph = applyGraphPatch(
    currentGraph,
    clarification.entity_type,
    clarification.entity_key,
    clarification.field,
    answer
  )
  const newVersion = (narrativeRow?.graph_version ?? 0) + 1

  // If this is an era clarification, also update the entry's era column
  if (clarification.entity_type === 'era') {
    await service
      .from('entries')
      .update({ era: answer })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
  }

  // Update narrative graph
  await service
    .from('narratives')
    .upsert({
      user_id: user.id,
      graph: encrypt(JSON.stringify(updatedGraph), process.env.MEMORY_ENCRYPTION_KEY!),
      graph_version: newVersion,
      updated_at: now,
    }, { onConflict: 'user_id' })

  return NextResponse.json({ ok: true })
}
