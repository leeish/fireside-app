import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { inngest } from '@/inngest/client'
import { getAIClient } from '@/lib/ai'

// Resend posts inbound email metadata here — body must be fetched separately via API.
// Reply-to addresses are formatted as reply+{conversationId}@domain
// so we can route each reply back to the right conversation.

export async function POST(request: NextRequest) {
  const envelope = await request.json()
  const payload = envelope.data ?? envelope

  const emailId: string = payload.email_id ?? ''
  const to: string = Array.isArray(payload.to) ? payload.to[0] : (payload.to ?? '')
  const from: string = payload.from ?? ''

  if (!emailId) {
    return NextResponse.json({ error: 'No email_id in payload' }, { status: 400 })
  }

  const conversationId = parseConversationId(to)
  if (!conversationId) {
    return NextResponse.json({ error: 'No conversation ID in recipient address' }, { status: 400 })
  }

  // Fetch full email body via Resend SDK
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_INBOUND_KEY)
  const { data: emailData, error: emailError } = await resend.emails.receiving.get(emailId)

  if (emailError || !emailData) {
    console.error('[inbound] Failed to fetch email body:', emailError)
    return NextResponse.json({ error: 'Failed to fetch email body' }, { status: 500 })
  }

  const text: string = emailData.text ?? ''
  if (!text.trim()) {
    return NextResponse.json({ error: 'Empty email body' }, { status: 400 })
  }

  const responseText = await extractReply(text)
  if (!responseText) {
    return NextResponse.json({ error: 'Empty reply after extraction' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Load the conversation to get user_id and verify it exists
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, user_id, status, users(email)')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  // Verify the reply came from the right email address
  // @ts-expect-error — Supabase join type
  const userEmail: string = conversation.users?.email ?? ''
  const senderEmail = from.toLowerCase().replace(/.*<(.+)>/, '$1').trim()
  if (userEmail.toLowerCase() !== senderEmail) {
    return NextResponse.json({ error: 'Sender mismatch' }, { status: 403 })
  }

  // Idempotency: check for an existing user turn in this conversation
  const { data: existingTurns } = await supabase
    .from('turns')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .limit(1)

  if (existingTurns && existingTurns.length > 0) {
    return NextResponse.json({ ok: true, note: 'already received a reply for this conversation' })
  }

  // Encrypt and store the user's reply
  const encryptedContent = encrypt(responseText, process.env.MEMORY_ENCRYPTION_KEY!)

  const { data: turn, error: turnError } = await supabase
    .from('turns')
    .insert({
      conversation_id: conversationId,
      user_id: conversation.user_id,
      role: 'user',
      content: encryptedContent,
      channel: 'email',
      processed: false,
    })
    .select('id')
    .single()

  if (turnError || !turn) {
    console.error('[inbound] Failed to store turn:', turnError)
    return NextResponse.json({ error: 'Failed to store reply' }, { status: 500 })
  }

  // Mark the queued_prompt as engaged
  await supabase
    .from('queued_prompts')
    .update({ delivery_state: 'engaged', engaged_at: new Date().toISOString() })
    .eq('user_id', conversation.user_id)
    .eq('delivery_state', 'email_sent')

  // Update user's last_active_at
  await supabase
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', conversation.user_id)

  // Trigger extraction and graph update
  await inngest.send({ name: 'fireside/entry.enrich', data: { turnId: turn.id } })

  return NextResponse.json({ ok: true })
}

function parseConversationId(address: string): string | null {
  const match = address.match(/reply\+([^@]+)@/)
  return match?.[1] ?? null
}

// Use LLM to extract only the user's new reply, stripping quoted history regardless of email client format
async function extractReply(text: string): Promise<string> {
  const { client, model } = getAIClient()

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    store: false,
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: 'You are extracting the new reply text from an email. Return only the text the person wrote in their new reply — nothing from the quoted/forwarded history below it. Return plain text only, no commentary, no formatting.',
      },
      {
        role: 'user',
        content: text,
      },
    ],
  })

  return completion.choices[0].message.content?.trim() ?? ''
}
