import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const era = searchParams.get('era')
  const person = searchParams.get('person')

  if (!era && !person) {
    return NextResponse.json({ error: 'Provide era or person param' }, { status: 400 })
  }

  const service = createServiceClient()

  let query = service
    .from('entries')
    .select('id, conversation_id, settled_at, conversations(topic)')
    .eq('user_id', user.id)
    .not('settled_at', 'is', null)
    .order('settled_at', { ascending: false })

  if (era) {
    query = query.eq('era', era)
  } else if (person) {
    query = query.contains('people_mentioned', [person])
  }

  const { data: entries, error } = await query

  if (error) {
    console.error('[story-map/entries]', error)
    return NextResponse.json({ error: 'Failed to load entries' }, { status: 500 })
  }

  const results = (entries ?? []).map((e: any) => ({
    id: e.id,
    conversationId: e.conversation_id,
    settledAt: e.settled_at,
    topic: e.conversations?.topic ?? null,
  }))

  return NextResponse.json({ entries: results })
}
