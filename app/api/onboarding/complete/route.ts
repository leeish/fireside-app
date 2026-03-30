import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { inngest } from '@/inngest/client'
import { OnboardingCompleteSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = OnboardingCompleteSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { displayName, onboardingProfile } = parsed.data

  const service = createServiceClient()

  const { error } = await service
    .from('users')
    .upsert({
      id: user.id,
      email: user.email!,
      display_name: displayName,
      onboarding_profile: onboardingProfile ?? {},
    }, { onConflict: 'id' })

  if (error) {
    console.error('[onboarding] upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Seed the narrative graph from onboarding data
  await inngest.send({
    name: 'fireside/onboarding.seed',
    data: { userId: user.id, displayName, onboardingProfile: onboardingProfile ?? {} },
  })

  return NextResponse.json({ ok: true })
}
