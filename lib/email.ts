import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export interface SendPromptOptions {
  to: string
  userName: string
  promptText: string
  conversationId: string  // encoded in reply-to so inbound can route the reply
}

export async function sendPrompt({ to, userName, promptText, conversationId }: SendPromptOptions) {
  // reply+{conversationId}@domain — inbound webhook parses this to find the conversation
  const replyTo = `reply+${conversationId}@bartelme.info`

  const { data, error } = await getResend().emails.send({
    from: process.env.RESEND_FROM!,
    to,
    replyTo,
    subject: 'A question for you',
    text: buildPromptText(userName, promptText),
    html: buildPromptHtml(userName, promptText),
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
  return data
}

function buildPromptText(name: string, prompt: string): string {
  return `Hi ${name},\n\n${prompt}\n\nJust reply to this email with your answer — no app needed.\n\nFireside`
}

function buildPromptHtml(name: string, prompt: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; color: #1c1c1c;">
  <p style="font-size: 16px; line-height: 1.6;">Hi ${name},</p>
  <p style="font-size: 18px; line-height: 1.7; color: #3d2c1e; font-style: italic; border-left: 3px solid #b45309; padding-left: 16px; margin: 28px 0;">${prompt}</p>
  <p style="font-size: 15px; line-height: 1.6; color: #555;">Just reply to this email with your answer — no app needed.</p>
  <p style="font-size: 14px; color: #999; margin-top: 40px;">Fireside</p>
</body>
</html>
  `.trim()
}
