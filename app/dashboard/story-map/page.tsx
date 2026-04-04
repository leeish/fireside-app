import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { normalizeGraph } from '@/lib/graph'
import StoryMapClient from './StoryMapClient'

export default async function StoryMapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: narrative } = await service
    .from('narratives')
    .select('graph')
    .eq('user_id', user.id)
    .single()

  if (!narrative) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-fg text-sm">No story data yet. Start a conversation to build your story map.</p>
      </div>
    )
  }

  const graph = normalizeGraph(
    JSON.parse(decrypt(narrative.graph as string, process.env.MEMORY_ENCRYPTION_KEY!))
  )

  return <StoryMapClient graph={graph} />
}
