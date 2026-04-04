import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export default async function EraEntriesPage({ params }: { params: Promise<{ era: string }> }) {
  const { era } = await params
  const decodedEra = decodeURIComponent(era)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: entries } = await service
    .from('entries')
    .select('id, conversation_id, settled_at, conversations(topic)')
    .eq('user_id', user.id)
    .eq('era', decodedEra)
    .not('settled_at', 'is', null)
    .order('settled_at', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-1">
        <Link
          href="/dashboard/story-map"
          className="text-xs text-muted-fg hover:text-foreground transition-colors duration-200"
        >
          Your story map
        </Link>
        <h1 className="text-lg font-display font-semibold text-foreground capitalize">{decodedEra}</h1>
        <p className="text-sm text-muted-fg">{entries?.length ?? 0} {entries?.length === 1 ? 'entry' : 'entries'}</p>
      </div>

      {!entries || entries.length === 0 ? (
        <p className="text-sm text-muted-fg">No entries found for this era yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry: any) => (
            <Link
              key={entry.id}
              href={`/dashboard/conversation/${entry.conversation_id}`}
              className="block bg-card border border-border/50 rounded-2xl px-5 py-4 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 group space-y-1"
            >
              <p className="text-sm text-foreground/80 leading-snug group-hover:text-foreground transition-colors duration-300">
                {(entry.conversations as any)?.topic ?? 'Untitled conversation'}
              </p>
              <p className="text-xs text-muted-fg">
                {new Date(entry.settled_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
