import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import AppendForm from './AppendForm'

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, topic, status, opened_at, channel')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!conversation) redirect('/dashboard')

  const { data: turns } = await service
    .from('turns')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  const decryptedTurns = (turns ?? []).map(turn => ({
    ...turn,
    content: turn.role === 'user'
      ? (() => {
          try { return decrypt(turn.content, process.env.MEMORY_ENCRYPTION_KEY!) }
          catch { return '[Unable to decrypt]' }
        })()
      : turn.content,
  }))

  const openedDate = new Date(conversation.opened_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-10">

        <div className="mb-8">
          <Link href="/dashboard" className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 mb-6">
            &larr; Back
          </Link>
          <p className="text-xs text-stone-400 mb-1">{openedDate}</p>
          <h1 className="text-lg font-semibold text-stone-800 leading-snug">{conversation.topic}</h1>
        </div>

        <div className="space-y-6 mb-10">
          {decryptedTurns.map(turn => (
            <div key={turn.id} className={turn.role === 'biographer' ? '' : 'pl-4 border-l-2 border-amber-200'}>
              {turn.role === 'biographer' ? (
                <p className="text-sm font-medium text-stone-500 leading-relaxed italic">
                  {turn.content}
                </p>
              ) : (
                <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
                  {turn.content}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-stone-200 pt-8">
          <AppendForm conversationId={conversation.id} />
        </div>

      </div>
    </div>
  )
}
