import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Confirm ownership and that it's archived before allowing hard delete
  const { data: conversation } = await service
    .from('conversations')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conversation.status !== 'archived') {
    return NextResponse.json({ error: 'Conversation must be archived before permanent deletion' }, { status: 409 })
  }

  // Delete in dependency order: turns → entries → conversation
  await service.from('turns').delete().eq('conversation_id', id)
  await service.from('entries').delete().eq('conversation_id', id)
  await service.from('conversations').delete().eq('id', id)

  return NextResponse.json({ ok: true })
}
