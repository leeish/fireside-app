import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/crypto'
import { chatComplete, logTokenUsage } from '@/lib/ai'

type ChatRespondEvent = {
  data: {
    conversationId: string
    userId: string
  }
}

const CHAT_SYSTEM = `You are a thoughtful, patient biographer having a real-time conversation with someone to help capture their life story.

You are not running an interview from a list. You are someone who has been listening closely and genuinely cares about the story unfolding in front of you. Your responses should feel like they came from a person, not a product.

THE SPINE: This conversation was opened with a specific question on a specific topic. Your job is to deepen that topic. Do not redirect to other interests or stories — even if you know them from the person's background. If a new thread surfaces mid-conversation, note it quietly and stay with what was started. The spine is everything.

YOUR RHYTHM:
- You may open with one brief sentence that reflects back something specific they just said — using their exact words, not a paraphrase, and without adding meaning they didn't express. This is optional. Only do it when something genuinely specific warrants it. Never filler like "That sounds meaningful" or "That must have been hard."
- Then ask the next question. Specific, grounded in the exact words and details they just shared.
- One question only. Never two questions in one response.
- Never start your response with "I". It centers you, not them.
- Never use the phrase "What was it about" — it is overused and generic.
- Never generic. If the question could apply to anyone, it is wrong.
- Three sentences maximum for the entire response.
- Vary your sentence structure. Not every question should start the same way.

KNOWING WHEN TO WRAP: You are watching the conversation as it unfolds. When the spine feels reasonably told — the core story has been shared, the person seems satisfied, or their responses are getting shorter and more final — offer a wrap instead of another question. Name one specific thing they shared using their exact words, tell them you don't think they've written that down before, then ask if there's more or if it's time to capture it. A wrap offer is not a closing — it is a genuine question. Set "wrap" to true when you do this.

Example wrap: "You just told me about watching the Cowboys destroy the Bills with your dad at his friend's house — the blackjack and all of it. I don't think you've ever written that down before. Does that feel like the story for now, or is there more you want to add?"

Return JSON with exactly these fields:
{ "response": "your full response text", "wrap": false }`

export const chatRespond = inngest.createFunction(
  { id: 'chat-respond', retries: 2, triggers: [{ event: 'fireside/chat.respond' }] },
  async ({ event }: { event: ChatRespondEvent }) => {
    const { conversationId, userId } = event.data
    const supabase = createServiceClient()

    // Load narrative graph for background context
    const { data: narrative } = await supabase
      .from('narratives')
      .select('graph, rolling_summary')
      .eq('user_id', userId)
      .single()

    // Load all turns
    const { data: rawTurns } = await supabase
      .from('turns')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    const allTurns = rawTurns ?? []

    const decryptedTurns = allTurns.map(t => ({
      ...t,
      content: t.role === 'user'
        ? (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })()
        : t.content,
    }))

    // Build proper alternating messages array — 'biographer' turns become 'assistant'
    const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = decryptedTurns.map(t => ({
      role: t.role === 'user' ? 'user' : 'assistant',
      content: t.content,
    }))

    // Background context goes in the system prompt so it frames every turn
    const rollingSummary = narrative?.rolling_summary
      ? decrypt(narrative.rolling_summary as string, process.env.MEMORY_ENCRYPTION_KEY!)
      : null
    const systemPrompt = rollingSummary
      ? `${CHAT_SYSTEM}\n\nBackground on this person: ${rollingSummary}`
      : CHAT_SYSTEM

    const { text: raw, inputTokens, outputTokens } = await chatComplete({
      system: systemPrompt,
      messages: chatMessages,
      temperature: 0.7,
      maxTokens: 300,
    })

    const chatModel = process.env.CHAT_MODEL ?? 'claude-haiku-4-5-20251001'
    await logTokenUsage(supabase, {
      userId,
      conversationId,
      inngestFunction: 'chat-respond',
      model: chatModel,
      inputTokens,
      outputTokens,
      purpose: 'biographer response',
    })

    const parsed = JSON.parse(raw) as { response: string; wrap?: boolean }
    const responseText = parsed.response?.trim() ?? ''

    if (!responseText) throw new Error('Empty response from chat model')

    // Save biographer turn
    await supabase.from('turns').insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'biographer',
      content: responseText,
      channel: 'app',
      processed: true,
    })

    // Model signals wrap — update conversation status
    if (parsed.wrap === true) {
      await supabase
        .from('conversations')
        .update({ status: 'wrap_offered' })
        .eq('id', conversationId)
    }

    return { conversationId, wrap: parsed.wrap ?? false }
  }
)
