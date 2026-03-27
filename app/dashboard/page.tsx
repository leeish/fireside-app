import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import FirstPromptPicker from './FirstPromptPicker'
import LogoutButton from './LogoutButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: conversations },
    { data: queuedPrompt },
    { data: unprocessedTurn },
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
  ])

  const userName = profile?.display_name ?? 'Friend'
  const hasConversations = conversations && conversations.length > 0
  const isProcessing = !!unprocessedTurn && !queuedPrompt

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-10">

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-stone-800">Fireside</h1>
          <div className="flex items-center gap-4">
            <p className="text-sm text-stone-400">{user.email}</p>
            <LogoutButton />
          </div>
        </div>

        {/* New user */}
        {!hasConversations && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
            <FirstPromptPicker userName={userName} />
          </div>
        )}

        {/* Returning user */}
        {hasConversations && (
          <div className="space-y-6">

            {/* Pipeline still running */}
            {isProcessing && (
              <div className="bg-white border border-stone-200 rounded-2xl p-5 text-center">
                <p className="text-stone-500 text-sm">Reading your response and crafting your next question...</p>
              </div>
            )}

            {/* Queued prompt waiting for a response */}
            {queuedPrompt && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-3">
                  A question for you
                </p>
                <p className="text-stone-800 text-base leading-relaxed font-medium">
                  {queuedPrompt.question}
                </p>
                <p className="text-xs text-stone-400 mt-3">
                  Reply by email or answer below when you're ready.
                </p>
              </div>
            )}

            {/* Conversation list */}
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">
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
                    className="block bg-white border border-stone-200 rounded-xl px-5 py-4 hover:border-amber-400 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm text-stone-700 leading-snug line-clamp-2 flex-1">
                        {conv.topic ?? 'Untitled'}
                      </p>
                      <p className="text-xs text-stone-400 shrink-0">{date}</p>
                    </div>
                  </Link>
                )
              })}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
