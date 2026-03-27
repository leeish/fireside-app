import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/dashboard" className="text-xs text-stone-400 hover:text-stone-600">
            &larr; Back
          </Link>
          <div className="text-right">
            <p className="text-xs text-stone-400">Version {narrative?.graph_version ?? 0}</p>
            {narrative?.updated_at && (
              <p className="text-xs text-stone-400">
                Updated {new Date(narrative.updated_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <h1 className="text-lg font-semibold text-stone-800 mb-6">Narrative Graph</h1>

        {!narrative ? (
          <p className="text-stone-500 text-sm">No graph data yet.</p>
        ) : (
          <pre className="bg-white border border-stone-200 rounded-xl p-6 text-xs text-stone-700 overflow-auto leading-relaxed whitespace-pre-wrap">
            {JSON.stringify(narrative.graph, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
