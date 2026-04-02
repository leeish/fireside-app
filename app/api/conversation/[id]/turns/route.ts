import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Verify ownership
  const { data: conversation } = await service
    .from('conversations')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: turns } = await service
    .from('turns')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .eq('is_synthetic', false)
    .order('created_at', { ascending: true })

  const decrypted = (turns ?? []).map(turn => ({
    id: turn.id,
    role: turn.role,
    created_at: turn.created_at,
    content: (() => { try { return decrypt(turn.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })(),
  }))

  return NextResponse.json({ turns: decrypted, status: conversation.status })
}
