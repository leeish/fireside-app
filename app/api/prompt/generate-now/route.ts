import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Block if a prompt is already queued and waiting
  const { data: existing } = await supabase
    .from('queued_prompts')
    .select('id')
    .eq('user_id', user.id)
    .in('delivery_state', ['queued', 'in_app_seen'])
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A prompt is already queued' }, { status: 409 })
  }

  await inngest.send({
    name: 'fireside/prompt.select',
    data: { userId: user.id },
  })

  return NextResponse.json({ success: true })
}
