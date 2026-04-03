import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import ConversationClient from './ConversationClient'
import SettledView from './SettledView'

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const { data: userProfile } = await service
    .from('users')
    .select('title_style')
    .eq('id', user.id)
    .single()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, topic, status, opened_at, channel')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!conversation) redirect('/dashboard')
  if (conversation.status === 'archived') redirect('/dashboard/archive')

  const { data: turns } = await service
    .from('turns')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .eq('is_synthetic', false)
    .order('created_at', { ascending: true })

  const decryptedTurns = (turns ?? []).map(turn => ({
    id: turn.id,
    role: turn.role,
    created_at: turn.created_at,
    content: (() => {
      try { return decrypt(turn.content, process.env.MEMORY_ENCRYPTION_KEY!) }
      catch { return '[Unable to decrypt]' }
    })(),
  }))

  const openedDate = new Date(conversation.opened_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const isSettled = conversation.status === 'settled'

  // Fetch entry only when settled (needed for cleanup/story tabs)
  let entry = null
  let clarificationsCount = 0
  if (isSettled) {
    const { data } = await service
      .from('entries')
      .select('id, content, cleaned_content, story_content, story_intensity')
      .eq('conversation_id', id)
      .maybeSingle()
    entry = data

    // Query pending clarifications count
    const { count: pendingCount } = await service
      .from('clarifications')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', id)
      .eq('status', 'pending')
    clarificationsCount = pendingCount ?? 0
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      <div className="mb-8">
        <p className="text-xs text-muted-fg mb-1">{openedDate}</p>
        {!isSettled && (
          <h1 className="text-lg font-display font-semibold text-foreground leading-snug whitespace-normal break-words">{conversation.topic}</h1>
        )}
      </div>

      {isSettled ? (
        <SettledView
          conversationId={conversation.id}
          channel={conversation.channel}
          turns={decryptedTurns}
          entry={entry}
          topic={conversation.topic}
          clarificationsCount={clarificationsCount}
          titleStyle={userProfile?.title_style ?? 'simple'}
        />
      ) : (
        <ConversationClient
          conversationId={conversation.id}
          topic={conversation.topic}
          openedDate={openedDate}
          initialTurns={decryptedTurns}
          initialStatus={conversation.status}
        />
      )}

    </div>
  )
}
