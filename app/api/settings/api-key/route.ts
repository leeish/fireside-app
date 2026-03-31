import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { encrypt } from '@/lib/crypto'
import { ApiKeySchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = ApiKeySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { apiKey } = parsed.data

  // Validate the key before storing it
  try {
    const client = new Anthropic({ apiKey })
    await client.models.list()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `API key validation failed: ${msg}` }, { status: 400 })
  }

  const service = createServiceClient()
  const encrypted = encrypt(apiKey, process.env.MEMORY_ENCRYPTION_KEY!)

  await service
    .from('users')
    .update({
      anthropic_api_key: encrypted,
      anthropic_api_key_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  await service
    .from('users')
    .update({
      anthropic_api_key: null,
      anthropic_api_key_status: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
