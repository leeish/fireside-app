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

const CHAT_SYSTEM = `You are a biographer having a real-time conversation with someone to help capture their life story. Your job is to deepen the current topic through thoughtful follow-up questions.

Rules:
- Stay on the spine (the current topic). Do not chase new threads mid-conversation — note them internally, do not follow them.
- React briefly to what they just said (one sentence maximum), then ask the next question. Silence before a good question is better than a filler sentence.
- Questions must be specific and grounded in what they just shared — not generic.
- Never ask two questions at once.
- If the person seems to be winding down (short responses, single sentences, trailing off), set shouldWrap to true.

Return JSON with exactly these fields:
{ "response": "your response text", "shouldWrap": false }`

const WRAP_SYSTEM = `You are a biographer wrapping up a conversation. The person has shared enough on this topic.

Write a closing response that:
1. Names what was captured — one specific sentence referencing what they actually shared
2. Affirms it without being effusive
3. Offers a gentle close — no pressure, no next steps

Example: "You just told me about the night before your mission farewell — I don't think you've ever written that down before. It's there now."

2-3 sentences maximum. Warm but not gushing.

Return JSON with exactly these fields:
{ "response": "your closing text", "shouldWrap": true }`

export const chatRespond = inngest.createFunction(
  { id: 'chat-respond', retries: 2, triggers: [{ event: 'fireside/chat.respond' }] },
  async ({ event }: { event: ChatRespondEvent }) => {
    const { conversationId, userId } = event.data
    const supabase = createServiceClient()
    const { client, model } = getAIClient()

    // Load narrative graph
    const { data: narrative } = await supabase
      .from('narratives')
      .select('graph, rolling_summary')
      .eq('user_id', userId)
      .single()

    // Load recent turns (up to 8, reversed to get chronological order)
    const { data: rawTurns } = await supabase
      .from('turns')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(8)

    const recentTurns = (rawTurns ?? []).reverse()

    // Decrypt user turns for context
    const decryptedTurns = recentTurns.map(t => ({
      ...t,
      content: t.role === 'user'
        ? (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })()
        : t.content,
    }))

    // Wrap conditions: 5+ user turns, or 3+ turns with a short last response
    const userTurns = decryptedTurns.filter(t => t.role === 'user')
    const lastUserContent = userTurns[userTurns.length - 1]?.content ?? ''
    const shouldWrap = userTurns.length >= 5 || (userTurns.length >= 3 && lastUserContent.length < 80)

    const graphContext = narrative?.rolling_summary
      || JSON.stringify(narrative?.graph ?? {}).slice(0, 1200)

    const conversationContext = decryptedTurns
      .map(t => `${t.role === 'user' ? 'Person' : 'Biographer'}: ${t.content}`)
      .join('\n\n')

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      store: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: shouldWrap ? WRAP_SYSTEM : CHAT_SYSTEM },
        {
          role: 'user',
          content: `Person's background:\n${graphContext}\n\nConversation so far:\n${conversationContext}\n\nGenerate your next response.`,
        },
      ],
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const parsed = JSON.parse(raw) as { response: string; shouldWrap: boolean }
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

    // If wrapping, settle the conversation and enrich the last user turn
    if (parsed.shouldWrap || shouldWrap) {
      await supabase
        .from('conversations')
        .update({ status: 'settled' })
        .eq('id', conversationId)

      const lastUserTurn = [...userTurns].pop()
      if (lastUserTurn) {
        await inngest.send({
          name: 'fireside/entry.enrich',
          data: { turnId: lastUserTurn.id },
        })
      }
    }

    return { conversationId, wrapped: parsed.shouldWrap || shouldWrap }
  }
)
