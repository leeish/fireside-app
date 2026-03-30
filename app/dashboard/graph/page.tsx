import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'

export default async function GraphPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: narrative } = await service
    .from('narratives')
    .select('graph, graph_version, updated_at')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6 flex items-center justify-end">
        <div className="text-right">
          <p className="text-xs text-muted-fg">Version {narrative?.graph_version ?? 0}</p>
          {narrative?.updated_at && (
            <p className="text-xs text-muted-fg">
              Updated {new Date(narrative.updated_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <h1 className="text-lg font-semibold text-foreground mb-6">Narrative Graph</h1>

      {!narrative ? (
        <p className="text-muted-fg text-sm">No graph data yet.</p>
      ) : (
        <pre className="bg-card border border-border rounded-xl p-6 text-xs text-foreground/80 overflow-auto leading-relaxed whitespace-pre-wrap">
          {JSON.stringify(JSON.parse(decrypt(narrative.graph as string, process.env.MEMORY_ENCRYPTION_KEY!)), null, 2)}
        </pre>
      )}
    </div>
  )
}
