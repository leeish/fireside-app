import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { applyGraphPatch, emptyGraph, type NarrativeGraph } from '@/lib/graph'

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
  const { clarificationId, answer } = await req.json()

  if (!clarificationId || !answer?.trim()) {
    return NextResponse.json({ error: 'Missing clarificationId or answer' }, { status: 400 })
  }

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
    .update({ status: 'answered', answer: answer.trim(), answered_at: now })
    .eq('id', clarificationId)

  // Load user's narrative graph and apply patch
  const { data: narrativeRow } = await service
    .from('narratives')
    .select('graph, graph_version')
    .eq('user_id', user.id)
    .single()

  const currentGraph: NarrativeGraph = (narrativeRow?.graph as NarrativeGraph) ?? emptyGraph()
  const updatedGraph = applyGraphPatch(
    currentGraph,
    clarification.entity_type,
    clarification.entity_key,
    clarification.field,
    answer.trim()
  )
  const newVersion = (narrativeRow?.graph_version ?? 0) + 1

  // Update narrative graph
  await service
    .from('narratives')
    .upsert({
      user_id: user.id,
      graph: updatedGraph,
      graph_version: newVersion,
      rolling_summary: updatedGraph.rolling_summary ?? null,
      updated_at: now,
    }, { onConflict: 'user_id' })

  return NextResponse.json({ ok: true })
}
