import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (conversation.status === 'archived') return NextResponse.json({ ok: true })

  await service
    .from('conversations')
    .update({ status: 'archived' })
    .eq('id', id)

  await service
    .from('entries')
    .update({ status: 'archived' })
    .eq('conversation_id', id)

  return NextResponse.json({ ok: true })
}
