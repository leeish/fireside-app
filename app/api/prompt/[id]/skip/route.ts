import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: promptId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: prompt } = await service
    .from('queued_prompts')
    .select('id, delivery_state')
    .eq('id', promptId)
    .eq('user_id', user.id)
    .single()

  if (!prompt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Mark skipped prompt as complete
  await service
    .from('queued_prompts')
    .update({ delivery_state: 'complete' })
    .eq('id', promptId)

  // Clear the soft pointer on the user row
  await service
    .from('users')
    .update({ queued_prompt_id: null })
    .eq('id', user.id)

  // Immediately queue a new prompt
  await inngest.send({
    name: 'fireside/prompt.select',
    data: { userId: user.id },
  })

  return NextResponse.json({ ok: true })
}
