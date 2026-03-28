import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FirstPromptPicker from './FirstPromptPicker'
import LogoutButton from './LogoutButton'
import PromptCard from './PromptCard'
import ThemeToggle from '@/app/components/ThemeToggle'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: conversations },
    { data: queuedPrompt },
    { data: unprocessedTurn },
    { data: failedTurn },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('conversations')
      .select('id, topic, status, opened_at, channel')
      .eq('user_id', user.id)
      .neq('status', 'archived')
      .order('opened_at', { ascending: false })
      .limit(20),
    supabase
      .from('queued_prompts')
      .select('id, question, question_type, delivery_state')
      .eq('user_id', user.id)
      .in('delivery_state', ['queued', 'in_app_seen'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('turns')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'user')
      .eq('processed', false)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('turns')
      .select('conversation_id')
      .eq('user_id', user.id)
      .eq('role', 'user')
      .eq('processed', false)
      .is('processed', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const userName = profile?.display_name ?? 'Friend'
  const hasConversations = conversations && conversations.length > 0
  const isProcessing = !!unprocessedTurn && !queuedPrompt

  return (
    <div className="min-h-screen bg-background">

      {/* Floating pill nav */}
      <div className="sticky top-4 z-40 px-4">
        <div
          className="max-w-2xl mx-auto flex items-center justify-between px-6 py-3 rounded-full border border-border/60 backdrop-blur-md"
          style={{ backgroundColor: 'var(--fs-glass)', boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.12)' }}
        >
          <h1 className="text-xl font-display font-semibold text-foreground tracking-tight">
            Fire<em>side</em>
          </h1>
          <div className="flex items-center gap-5">
            <p className="text-xs text-muted-fg hidden sm:block">{user.email}</p>
            <Link href="/settings" className="text-sm text-muted-fg hover:text-foreground transition-colors duration-300">Settings</Link>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-8 pb-16">

        {/* New user */}
        {!hasConversations && (
          <div
            className="bg-card rounded-[2rem] border border-border/50 p-8"
            style={{ boxShadow: '0 10px 40px -10px rgba(93, 112, 82, 0.12)' }}
          >
            <FirstPromptPicker userName={userName} />
          </div>
        )}

        {/* Returning user */}
        {hasConversations && (
          <div className="space-y-6">

            {/* Pipeline failed */}
            {!isProcessing && !queuedPrompt && failedTurn && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                <p className="text-sm text-red-700">
                  Something went wrong processing your last response. Your entry was saved — we'll try again shortly.
                </p>
              </div>
            )}

            {/* Pipeline still running */}
            {isProcessing && (
              <div
                className="bg-card border border-border/50 rounded-[2rem] p-6 text-center"
                style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
              >
                <p className="text-muted-fg text-sm italic font-display">Reading your response and crafting your next question...</p>
              </div>
            )}

            {/* Queued prompt waiting for a response */}
            {queuedPrompt && (
              <PromptCard promptId={queuedPrompt.id} question={queuedPrompt.question} />
            )}

            {/* Conversation list */}
            <div className="space-y-2">
              <h2 className="text-xs font-medium text-muted-fg uppercase tracking-widest mb-3">
                Your story so far
              </h2>
              {conversations!.map(conv => {
                const date = new Date(conv.opened_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
                return (
                  <Link
                    key={conv.id}
                    href={`/dashboard/conversation/${conv.id}`}
                    className="block bg-card border border-border/50 rounded-2xl px-5 py-4 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 group"
                    style={{ boxShadow: '0 2px 12px -4px rgba(93, 112, 82, 0.08)' }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm text-foreground/80 leading-snug line-clamp-2 flex-1 group-hover:text-foreground transition-colors duration-300">
                        {conv.topic ?? 'Untitled'}
                      </p>
                      <p className="text-xs text-muted-fg shrink-0">{date}</p>
                    </div>
                  </Link>
                )
              })}
            </div>

          </div>
        )}

        <div className="mt-12 flex items-center justify-center gap-6">
          <Link href="/dashboard/archive" className="text-xs text-muted-fg hover:text-foreground transition-colors duration-300">
            Archive
          </Link>
          <Link href="/dashboard/graph" className="text-xs text-border hover:text-muted-fg transition-colors duration-300">
            debug: view narrative graph
          </Link>
        </div>

      </div>
    </div>
  )
}
