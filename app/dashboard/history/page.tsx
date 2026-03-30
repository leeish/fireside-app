import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, topic, status, opened_at, channel')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      <div className="mb-8">
        <h1 className="text-lg font-display font-semibold text-foreground">All Conversations</h1>
        <p className="text-sm text-muted-fg mt-1">Every conversation in your journal, sorted by recent activity.</p>
      </div>

      <div className="space-y-2">
        {(conversations ?? []).map(conv => {
          const date = new Date(conv.opened_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })
          const isSettled = conv.status === 'settled'
          const isActive = conv.status === 'active' || conv.status === 'wrap_offered'

          return (
            <Link
              key={conv.id}
              href={`/dashboard/conversation/${conv.id}`}
              className="block bg-card border border-border/50 rounded-2xl px-5 py-4 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 group"
              style={{ boxShadow: '0 2px 12px -4px rgba(93, 112, 82, 0.08)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-foreground/80 leading-snug line-clamp-2 flex-1 group-hover:text-foreground transition-colors duration-300">
                  {conv.topic ?? 'Untitled'}
                </p>
                <p className="text-xs text-muted-fg shrink-0 mt-0.5">{date}</p>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {isActive && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-600/90">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    In progress
                  </span>
                )}
                {isSettled && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-primary/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    Complete
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>

    </div>
  )
}
