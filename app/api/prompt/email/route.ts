import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'
import { PromptEmailSchema } from '@/lib/schemas'

// Manually triggers an email delivery for testing / admin use.
// Creates a queued_prompt row, then fires fireside/prompt.deliver immediately.

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = PromptEmailSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { promptText, promptCategory } = parsed.data

  const service = createServiceClient()

  // Insert the queued_prompt directly
  const { data: qp, error: qpError } = await service
    .from('queued_prompts')
    .insert({
      user_id: user.id,
      question: promptText,
      thread_id: promptCategory ?? 'manual',
      question_type: 'depth',  // manual sends are untyped — default to depth
      delivery_state: 'queued',
    })
    .select('id')
    .single()

  if (qpError || !qp) {
    return NextResponse.json({ error: 'Failed to create queued prompt', detail: qpError?.message }, { status: 500 })
  }

  // Update the soft pointer
  await service
    .from('users')
    .update({ queued_prompt_id: qp.id })
    .eq('id', user.id)

  // Fire delivery immediately (no scheduling delay)
  await inngest.send({
    name: 'fireside/prompt.deliver',
    data: { userId: user.id, queuedPromptId: qp.id },
  })

  return NextResponse.json({ ok: true, queuedPromptId: qp.id })
}
