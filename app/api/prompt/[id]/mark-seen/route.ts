import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const promptId = params.id
    const service = createServiceClient()

    // Verify ownership and update to in_app_seen
    const { error } = await service
      .from('queued_prompts')
      .update({ delivery_state: 'in_app_seen' })
      .eq('id', promptId)
      .eq('user_id', user.id)
      .eq('delivery_state', 'queued')  // Only update if still queued (not already seen/engaged)

    if (error) {
      console.error('[mark-seen] error updating prompt:', error)
      // Fire-and-forget — don't fail the response
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[mark-seen] error:', err)
    // Fire-and-forget — don't fail the response
    return NextResponse.json({ ok: true })
  }
}
