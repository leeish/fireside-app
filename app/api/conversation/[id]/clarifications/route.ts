import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { applyGraphPatch, emptyGraph, type NarrativeGraph } from '@/lib/graph'
import { decrypt, encrypt } from '@/lib/crypto'
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
    ? JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!))
    : emptyGraph()
  const updatedGraph = applyGraphPatch(
    currentGraph,
    clarification.entity_type,
    clarification.entity_key,
    clarification.field,
    answer
  )
  const newVersion = (narrativeRow?.graph_version ?? 0) + 1

  // Update narrative graph
  await service
    .from('narratives')
    .upsert({
      user_id: user.id,
      graph: encrypt(JSON.stringify(updatedGraph), process.env.MEMORY_ENCRYPTION_KEY!),
      graph_version: newVersion,
      rolling_summary: updatedGraph.rolling_summary
        ? encrypt(updatedGraph.rolling_summary, process.env.MEMORY_ENCRYPTION_KEY!)
        : null,
      updated_at: now,
    }, { onConflict: 'user_id' })

  return NextResponse.json({ ok: true })
}
