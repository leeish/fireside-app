import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/crypto'
import { renamePlace, normalizeGraph } from '@/lib/graph'
import type { NarrativeGraph } from '@/lib/graph'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { oldName, newName } = await request.json()
  if (!oldName || !newName || oldName === newName) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: narrativeRow, error } = await service
    .from('narratives')
    .select('graph, graph_version')
    .eq('user_id', user.id)
    .single()

  if (error || !narrativeRow) {
    return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
  }

  const currentGraph: NarrativeGraph = normalizeGraph(
    JSON.parse(decrypt(narrativeRow.graph as string, process.env.MEMORY_ENCRYPTION_KEY!))
  )

  if (!currentGraph.places[oldName]) {
    return NextResponse.json({ error: 'Place not found' }, { status: 404 })
  }

  const updatedGraph = renamePlace(currentGraph, oldName, newName)

  await service
    .from('narratives')
    .update({
      graph: encrypt(JSON.stringify(updatedGraph), process.env.MEMORY_ENCRYPTION_KEY!),
      graph_version: (narrativeRow.graph_version ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
