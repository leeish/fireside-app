import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/crypto'
import { mergePersonNodes, normalizeGraph } from '@/lib/graph'
import type { NarrativeGraph } from '@/lib/graph'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { canonical, duplicate } = await request.json()
  if (!canonical || !duplicate || canonical === duplicate) {
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

  if (!currentGraph.people[canonical] || !currentGraph.people[duplicate]) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }

  const updatedGraph = mergePersonNodes(currentGraph, canonical, duplicate)

  await service
    .from('narratives')
    .update({
      graph: encrypt(JSON.stringify(updatedGraph), process.env.MEMORY_ENCRYPTION_KEY!),
      graph_version: (narrativeRow.graph_version ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  // Replace duplicate name with canonical in all affected entry rows
  const { data: affectedEntries } = await service
    .from('entries')
    .select('id, people_mentioned')
    .eq('user_id', user.id)
    .contains('people_mentioned', [duplicate])

  if (affectedEntries && affectedEntries.length > 0) {
    await Promise.all(
      affectedEntries.map((entry: { id: string; people_mentioned: string[] }) =>
        service
          .from('entries')
          .update({
            people_mentioned: entry.people_mentioned.map((n: string) => n === duplicate ? canonical : n),
          })
          .eq('id', entry.id)
      )
    )
  }

  return NextResponse.json({ ok: true })
}
