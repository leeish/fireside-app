import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Draft saving — user is mid-response, hasn't submitted yet.
// In-progress drafts are held client-side (React state).
// This endpoint validates auth and returns ok so the UI can proceed.
// Full draft persistence (auto-save to DB) is a Phase 2 feature.

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Consume the body to avoid network errors on the client side
  await request.json().catch(() => {})

  return NextResponse.json({ ok: true })
}
