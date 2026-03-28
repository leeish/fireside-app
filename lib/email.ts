import { Resend } from 'resend'
import { createUnsubscribeToken } from './crypto'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export interface SendPromptOptions {
  to: string
  userName: string
  promptText: string
  conversationId: string  // encoded in reply-to so inbound can route the reply
  userId: string
}

export async function sendPrompt({ to, userName, promptText, conversationId, userId }: SendPromptOptions) {
  const replyTo = `reply+${conversationId}@bartelme.info`
  const token = createUnsubscribeToken(userId, process.env.UNSUBSCRIBE_SECRET!)
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/unsubscribe?token=${token}`

  const { data, error } = await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    replyTo,
    subject: 'A question for you',
    text: buildPromptText(userName, promptText, unsubscribeUrl),
    html: buildPromptHtml(userName, promptText, unsubscribeUrl),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
  return data
}

function buildPromptText(name: string, prompt: string, unsubscribeUrl: string): string {
  return `Hi ${name},\n\n${prompt}\n\nOr if something else is sitting with you today, write about that instead — I'm here for that too.\n\nJust reply to this email with your answer — no app needed.\n\nFireside\n\n---\nTo stop receiving prompts: ${unsubscribeUrl}`
}

function buildPromptHtml(name: string, prompt: string, unsubscribeUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1c1c1c;">
  <p style="font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="font-size: 18px; line-height: 1.7; color: #3d2c1e; font-style: italic; border-left: 3px solid #b45309; padding-left: 16px; margin: 28px 0;">${prompt}</p>
  <p style="font-size: 14px; line-height: 1.6; color: #888; font-style: italic;">Or if something else is sitting with you today, write about that instead — I'm here for that too.</p>
  <p style="font-size: 15px; line-height: 1.6; color: #555; margin-top: 20px;">Just reply to this email with your answer — no app needed.</p>
  <p style="font-size: 14px; color: #999; margin-top: 40px;">Fireside</p>
  <p style="font-size: 12px; color: #bbb; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">
    <a href="${unsubscribeUrl}" style="color: #bbb;">Unsubscribe</a>
  </p>
</body>
</html>
  `.trim()
}
