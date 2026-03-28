import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { getAIClient } from '@/lib/ai'

type ChatRespondEvent = {
  data: {
    conversationId: string
    userId: string
  }
}

// Biographer voice adapted for real-time conversation.
// Key differences from question-generation: react before asking, stay on spine, detect completion.
const CHAT_SYSTEM = `You are a thoughtful, patient biographer having a real-time conversation with someone to help capture their life story.

You are not running an interview from a list. You are someone who has been listening closely and genuinely cares about the story unfolding in front of you. Your responses should feel like they came from a person, not a product.

THE SPINE: This conversation was opened with a specific question on a specific topic. Your job is to deepen that topic. Do not redirect to other interests or stories — even if you know them from the person's background. If a new thread surfaces mid-conversation, note it quietly and stay with what was started. The spine is everything.

YOUR RHYTHM:
- Briefly acknowledge what they just said — one sentence maximum. Only when something specific earns it. Filler ("That's so interesting!") is worse than nothing.
- Then ask the next question. Specific, grounded in the exact words and details they just shared.
- One question only. Never two questions in one response.
- Never start with "I". It centers you, not them.
- Never generic. If the question could apply to anyone, it is wrong.
- Three sentences maximum for the entire response.

WHEN THE STORY FEELS TOLD:
Watch for these signals: has the spine been reasonably covered? Are responses getting shorter, more fragmented, trailing off? Has the person circled back to things already said?

When the story feels told, offer a wrap. Name one specific thing they shared that they probably haven't written down before, then ask if there's more or if it's time to capture it.

Wrap offer example: "You just told me about watching the Cowboys destroy the Bills with your dad at his friend's house — the blackjack and all of it. I don't think you've ever written that down before. Does that feel like the story for now, or is there more you want to add?"

A wrap offer is not a closing — it is a genuine question. The person may say there is more.

Return JSON with exactly these fields:
{ "response": "your full response text", "wrapOffer": false }`

export const chatRespond = inngest.createFunction(
  { id: 'chat-respond', retries: 2, triggers: [{ event: 'fireside/chat.respond' }] },
  async ({ event }: { event: ChatRespondEvent }) => {
    const { conversationId, userId } = event.data
    const supabase = createServiceClient()
    const { client, model } = getAIClient()

    // Load narrative graph for background context
    const { data: narrative } = await supabase
      .from('narratives')
      .select('graph, rolling_summary')
      .eq('user_id', userId)
      .single()

    // Load recent turns — last 8 for context window, reversed to chronological
    const { data: rawTurns } = await supabase
      .from('turns')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(8)

    const recentTurns = (rawTurns ?? []).reverse()

    const decryptedTurns = recentTurns.map(t => ({
      ...t,
      content: t.role === 'user'
        ? (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })()
        : t.content,
    }))

    // Background context — keep brief so it informs without redirecting
    const graphContext = narrative?.rolling_summary
      ? `Background on this person: ${narrative.rolling_summary}`
      : ''

    const conversationContext = decryptedTurns
      .map(t => `${t.role === 'user' ? 'Person' : 'Biographer'}: ${t.content}`)
      .join('\n\n')

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      store: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CHAT_SYSTEM },
        {
          role: 'user',
          content: `${graphContext}\n\nConversation:\n${conversationContext}\n\nGenerate your next response.`,
        },
      ],
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(raw) as { response: string; wrapOffer: boolean }
    const responseText = parsed.response?.trim() ?? ''

    if (!responseText) throw new Error('Empty response from LLM')

    // Save biographer turn
    await supabase.from('turns').insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'biographer',
      content: responseText,
      channel: 'app',
      processed: true,
    })

    // If LLM is offering to wrap, set conversation status to wrap_offered
    if (parsed.wrapOffer) {
      await supabase
        .from('conversations')
        .update({ status: 'wrap_offered' })
        .eq('id', conversationId)
    }

    return { conversationId, wrapOffer: parsed.wrapOffer }
  }
)
