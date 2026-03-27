import { redirect } from 'next/navigation'
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
    { data: entries },
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
      .from('entries')
      .select('id, content, era, themes, settled_at')
      .eq('user_id', user.id)
      .eq('status', 'settled')
      .order('settled_at', { ascending: false })
      .limit(10),
  ])

  const userName = profile?.display_name ?? 'Friend'
  const hasConversations = conversations && conversations.length > 0
  const hasEntries = entries && entries.length > 0

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-stone-800">Fireside</h1>
          <div className="flex items-center gap-4">
            <p className="text-sm text-stone-400">{user.email}</p>
            <LogoutButton />
          </div>
        </div>

        {/* New user — no conversations yet */}
        {!hasConversations && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
            <FirstPromptPicker userName={userName} />
          </div>
        )}

        {/* Returning user */}
        {hasConversations && (
          <div className="space-y-6">

            {/* Zone 1 — queued prompt waiting */}
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

            {/* Processing state — submitted but no prompt ready yet */}
            {!queuedPrompt && !hasEntries && (
              <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center">
                <p className="text-stone-500 text-sm">
                  Reading your response and crafting your next question…
                </p>
              </div>
            )}

            {/* Zone 3 — settled entries */}
            {hasEntries && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">
                  Your story so far
                </h2>
                {entries!.map(entry => {
                  const date = entry.settled_at
                    ? new Date(entry.settled_at).toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })
                    : ''
                  return (
                    <div key={entry.id} className="bg-white border border-stone-200 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-2">
                        {entry.era && (
                          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full capitalize">
                            {entry.era}
                          </span>
                        )}
                        {date && <p className="text-xs text-stone-400">{date}</p>}
                      </div>
                      <p className="text-sm text-stone-700 leading-relaxed line-clamp-4">
                        {entry.content}
                      </p>
                      {entry.themes && entry.themes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {entry.themes.slice(0, 4).map((theme: string) => (
                            <span key={theme} className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                              {theme}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Conversations list (Zone 2 — active threads) */}
            {conversations!.filter(c => c.status === 'active').length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">
                  In progress
                </h2>
                {conversations!.filter(c => c.status === 'active').map(conv => {
                  const date = new Date(conv.opened_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })
                  return (
                    <div key={conv.id} className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-center justify-between">
                      <p className="text-sm text-stone-700 leading-snug line-clamp-1 flex-1 mr-4">
                        {conv.topic ?? 'Untitled conversation'}
                      </p>
                      <p className="text-xs text-stone-400 shrink-0">{date}</p>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
