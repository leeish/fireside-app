import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ArchiveClient from './ArchiveClient'

export default async function ArchivePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, topic, opened_at, settled_at')
    .eq('user_id', user.id)
    .eq('status', 'archived')
    .order('settled_at', { ascending: false })

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      <div className="mb-8">
        <h1 className="text-lg font-display font-semibold text-foreground">Archive</h1>
        <p className="text-sm text-muted-fg mt-1">
          Conversations you've removed from your journal. Restore them or delete them permanently.
        </p>
      </div>

      <ArchiveClient conversations={conversations ?? []} />

    </div>
  )
}
