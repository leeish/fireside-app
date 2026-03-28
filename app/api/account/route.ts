import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const userId = user.id

  // Wipe all user data in dependency order
  await service.from('queued_prompts').delete().eq('user_id', userId)
  await service.from('turns').delete().eq('user_id', userId)
  await service.from('conversations').delete().eq('user_id', userId)
  await service.from('narratives').delete().eq('user_id', userId)
  await service.from('users').delete().eq('id', userId)

  // Delete the auth user (requires service role)
  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
