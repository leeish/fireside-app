import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SettingsUpdateSchema } from '@/lib/schemas'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = SettingsUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { display_name, cadence, is_active, title_style, pronouns } = parsed.data
  const updates: Record<string, unknown> = {}
  if (display_name !== undefined) updates.display_name = display_name
  if (cadence !== undefined) updates.cadence = cadence
  if (is_active !== undefined) updates.is_active = is_active
  if (title_style !== undefined) updates.title_style = title_style
  if (pronouns !== undefined) updates.pronouns = pronouns

  const service = createServiceClient()
  const { error } = await service
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
