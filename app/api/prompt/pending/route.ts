import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data } = await service
    .from('queued_prompts')
    .select('id')
    .eq('user_id', user.id)
    .in('delivery_state', ['queued', 'in_app_seen'])
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ found: !!data })
}
