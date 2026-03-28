import { type NextRequest, NextResponse } from 'next/server'
import { verifyUnsubscribeToken } from '@/lib/crypto'
import { createServiceClient } from '@/lib/supabase/server'

async function handleUnsubscribe(token: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: 'Missing token' }

  const userId = verifyUnsubscribeToken(token, process.env.UNSUBSCRIBE_SECRET!)
  if (!userId) return { ok: false, error: 'Invalid token' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('users')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Gmail one-click unsubscribe — sends POST directly, no UI needed
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const result = await handleUnsubscribe(token)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}

// User clicks the link in the email — show a confirmation page
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const result = await handleUnsubscribe(token)

  const html = result.ok
    ? `<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:480px;margin:80px auto;padding:0 24px;color:#1c1c1c;text-align:center;">
        <h2 style="font-weight:600;color:#292524;">You've been unsubscribed</h2>
        <p style="color:#78716c;line-height:1.6;">You won't receive any more prompts from Fireside. You can re-enable delivery anytime from your <a href="/settings" style="color:#b45309;">account settings</a>.</p>
      </body></html>`
    : `<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:480px;margin:80px auto;padding:0 24px;color:#1c1c1c;text-align:center;">
        <h2 style="font-weight:600;color:#292524;">Something went wrong</h2>
        <p style="color:#78716c;">This unsubscribe link may be invalid or expired. Visit your <a href="/settings" style="color:#b45309;">account settings</a> to manage delivery preferences.</p>
      </body></html>`

  return new NextResponse(html, {
    status: result.ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html' },
  })
}
