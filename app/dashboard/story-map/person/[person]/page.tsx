import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export default async function PersonEntriesPage({ params }: { params: Promise<{ person: string }> }) {
  const { person } = await params
  const decodedPerson = decodeURIComponent(person)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: entries } = await service
    .from('entries')
    .select('id, conversation_id, settled_at, conversations(topic)')
    .eq('user_id', user.id)
    .contains('people_mentioned', [decodedPerson])
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
        <h1 className="text-lg font-display font-semibold text-foreground">{decodedPerson}</h1>
        <p className="text-sm text-muted-fg">{entries?.length ?? 0} {entries?.length === 1 ? 'entry' : 'entries'}</p>
      </div>

      {!entries || entries.length === 0 ? (
        <p className="text-sm text-muted-fg">No entries found mentioning {decodedPerson} yet.</p>
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
