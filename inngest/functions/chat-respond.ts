import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { chatComplete, claudeComplete } from '@/lib/ai'

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

Return JSON with exactly this field:
{ "response": "your full response text" }`

const WRAP_ASSESSMENT_PROMPT = `You are assessing whether a biographical conversation has reached a natural resting point.

Look at the full conversation and return JSON with exactly this field:
{ "decision": "continue" | "wrap_offer" | "energy_drop" }

- "continue": the story still has material to uncover, energy is present
- "wrap_offer": the spine feels reasonably told, a good stopping point, person seems satisfied
- "energy_drop": responses are getting shorter, more fragmented, trailing off — the person may be running out of steam

Return only JSON. No explanation.`

const WRAP_OFFER_INSTRUCTION = `The assessment indicates this conversation may be at a natural resting point. Offer a wrap in your response. Name one specific thing they shared — using their exact words, not a paraphrase — that they probably haven't written down before. Then ask if there's more or if it's time to capture it.

Example: "You just told me about watching the Cowboys destroy the Bills with your dad at his friend's house — the blackjack and all of it. I don't think you've ever written that down before. Does that feel like the story for now, or is there more you want to add?"

A wrap offer is not a closing — it is a genuine question.`

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

    // Load all turns for full context (wrap assessment needs the complete arc)
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

    // Count user turns for periodic wrap assessment
    const userTurnCount = decryptedTurns.filter(t => t.role === 'user').length

    // Periodic wrap assessment — every 3 user turns, starting at turn 3
    let wrapAssessment: 'continue' | 'wrap_offer' | 'energy_drop' = 'continue'
    if (userTurnCount > 0 && userTurnCount % 3 === 0) {
      const conversationContext = decryptedTurns
        .map(t => `${t.role === 'user' ? 'Person' : 'Biographer'}: ${t.content}`)
        .join('\n\n')
      try {
        const raw = await claudeComplete({
          system: WRAP_ASSESSMENT_PROMPT,
          user: `Conversation so far:\n\n${conversationContext}`,
          temperature: 0,
          maxTokens: 50,
        })
        const parsed = JSON.parse(raw) as { decision: string }
        if (['continue', 'wrap_offer', 'energy_drop'].includes(parsed.decision)) {
          wrapAssessment = parsed.decision as typeof wrapAssessment
        }
      } catch {
        // assessment failed — default to continue
      }
    }

    // Use last 10 turns for the actual chat context window
    const recentTurns = decryptedTurns.slice(-10)

    const graphContext = narrative?.rolling_summary
      ? `Background on this person: ${narrative.rolling_summary}`
      : ''

    const conversationContext = recentTurns
      .map(t => `${t.role === 'user' ? 'Person' : 'Biographer'}: ${t.content}`)
      .join('\n\n')

    const wrapContext = wrapAssessment !== 'continue' ? `\n\n${WRAP_OFFER_INSTRUCTION}` : ''

    const userPrompt = `${graphContext}\n\nConversation:\n${conversationContext}${wrapContext}\n\nGenerate your next response.`

    const raw = await chatComplete({
      system: CHAT_SYSTEM,
      user: userPrompt,
      temperature: 0.7,
      maxTokens: 300,
    })

    const parsed = JSON.parse(raw) as { response: string }
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

    // If assessment flagged a wrap, set conversation status to wrap_offered
    if (wrapAssessment !== 'continue') {
      await supabase
        .from('conversations')
        .update({ status: 'wrap_offered' })
        .eq('id', conversationId)
    }

    return { conversationId, wrapAssessment }
  }
)
