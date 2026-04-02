import { inngest } from '../client'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/crypto'
import { chatComplete, claudeComplete, getClaudeClient, logTokenUsage, resolveApiKey, withUserKeyFallback } from '@/lib/ai'
import { generateEmbedding } from '@/lib/embeddings'

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
Vary your structure. Do not default to the same pattern every time. A real person in conversation does not always lead with an echo — sometimes they just ask. Use each of these forms across a conversation:

- Bare question. No preamble. Just the question, grounded in something specific they said. This is often the strongest move and should be used regularly — not avoided.
  Example: "What did it actually feel like the first time you held her?"

- Short observation + question. One sentence naming something specific using their exact words — no added meaning — then the question as a separate sentence. Use when something they said genuinely warrants naming first.
  Example: "You said you knew it was over before she did. What did you do with that in the months before you told her?"

- Echo setup — question. Restate a detail or phrase as a launching pad, then ask. Valid, but do not use this form more than once or twice in a row — it becomes a tic.
  Example: "Fifteen years of growth crammed into two — at what point did you realize that wasn't going to happen the way you'd planned?"

- Contrast or connection. Hold two things they've said in tension, or connect something from earlier in the conversation to what they just shared. Use when the threads actually warrant it.
  Example: "You came ready to sprint and left with momentum — but the first weeks sound like the opposite of that. What closed the gap?"

Hard rules across all forms:
- One question only. Never two.
- Never start with "I". It centers you, not them.
- Never use the phrase "What was it about".
- Never generic. If it could apply to anyone, it's wrong.
- Three sentences maximum.
- Do not use an em-dash pivot in every response. If you used it last time, don't use it this time.

KNOWING WHEN TO WRAP: You are watching the conversation as it unfolds. When the spine feels reasonably told — the core story has been shared, the person seems satisfied, or their responses are getting shorter and more final — offer a wrap instead of another question. Name one specific thing they shared using their exact words, tell them you don't think they've written that down before, then ask if there's more or if it's time to capture it. A wrap offer is not a closing — it is a genuine question. Set "wrap" to true when you do this.

Example wrap: "You just told me about watching the Cowboys destroy the Bills with your dad at his friend's house — the blackjack and all of it. I don't think you've ever written that down before. Does that feel like the story for now, or is there more you want to add?"

Return JSON with exactly these fields:
{ "response": "your full response text", "wrap": false }`

const CONTEXT_ADDENDUM_SYSTEM = `You are a biographer's research assistant supporting a live conversation.

You have been given excerpts from this person's past writing that are relevant to the current conversation topic. Write 2-3 sentences the biographer should carry in mind — drawn entirely from these past entries, not from what is being said right now. Be specific: name people, places, or memories from the actual entries. Do not generalize. Do not summarize the current conversation. Write in third person as notes about the person, not addressed to them.`

// Pure helper — exported for testing
export function shouldRefreshContext(realUserTurnCount: number, interval: number): boolean {
  return realUserTurnCount > 0 && realUserTurnCount % interval === 0
}

export const chatRespond = inngest.createFunction(
  { id: 'chat-respond', retries: 2, triggers: [{ event: 'fireside/chat.respond' }] },
  async ({ event }: { event: ChatRespondEvent }) => {
    const { conversationId, userId } = event.data
    const supabase = createServiceClient()

    const userApiKey = await resolveApiKey(userId, supabase)

    // Load narrative graph for background context
    const { data: narrative } = await supabase
      .from('narratives')
      .select('graph')
      .eq('user_id', userId)
      .single()

    // Load topic-scoped notes from the queued_prompt that opened this conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('queued_prompt_id')
      .eq('id', conversationId)
      .single()

    let promptContext: string | null = null
    if (conversation?.queued_prompt_id) {
      const { data: qp } = await supabase
        .from('queued_prompts')
        .select('prompt_context')
        .eq('id', conversation.queued_prompt_id)
        .single()
      promptContext = qp?.prompt_context ?? null
    }

    // Load all turns — includes synthetic turns so they appear in the messages array sent to Claude
    const { data: rawTurns } = await supabase
      .from('turns')
      .select('id, role, content, created_at, is_synthetic')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    const allTurns = rawTurns ?? []

    // Count only real (non-synthetic) user turns for the RAG refresh interval check
    const realUserTurnCount = allTurns.filter(t => t.role === 'user' && !t.is_synthetic).length

    const decryptedTurns = allTurns.map(t => ({
      ...t,
      content: (() => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return t.content } })(),
    }))

    // Build proper alternating messages array — 'biographer' turns become 'assistant'
    // Synthetic turns are included here intentionally: they enrich the biographer's context
    // without modifying the system prompt (which would bust the prompt cache)
    const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = decryptedTurns.map(t => ({
      role: t.role === 'user' ? 'user' : 'assistant',
      content: t.content,
    }))

    // Guard: conversation must end with a user message or the API will reject it.
    // This can happen if a previous chat-respond saved a biographer turn before this one runs.
    if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== 'user') {
      console.warn('[chat-respond] skipping — last turn is not a user message', { conversationId, turns: chatMessages.length })
      return { skipped: 'last turn is not user' }
    }

    // Background context goes in the system prompt so it frames every turn
    const systemPrompt = promptContext
      ? `${CHAT_SYSTEM}\n\nBiographer's notes on this conversation topic (based on what this person has actually written):\n${promptContext}`
      : CHAT_SYSTEM

    const { text: raw, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens } = await withUserKeyFallback(userId, supabase, userApiKey, (key) =>
      chatComplete({
        system: systemPrompt,
        messages: chatMessages,
        temperature: 0.7,
        maxTokens: 300,
        enableCache: true,
        apiKey: key,
      })
    )

    const chatModel = process.env.CHAT_MODEL ?? 'claude-haiku-4-5-20251001'
    await logTokenUsage(supabase, {
      userId,
      conversationId,
      inngestFunction: 'chat-respond',
      model: chatModel,
      inputTokens,
      outputTokens,
      purpose: 'biographer response',
      cacheCreationTokens,
      cacheReadTokens,
    })

    const parsed = JSON.parse(raw) as { response: string; wrap?: boolean }
    const responseText = parsed.response?.trim() ?? ''

    if (!responseText) throw new Error('Empty response from chat model')

    // Save biographer turn
    await supabase.from('turns').insert({
      conversation_id: conversationId,
      user_id: userId,
      role: 'biographer',
      content: encrypt(responseText, process.env.MEMORY_ENCRYPTION_KEY!),
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

    // Mid-conversation RAG refresh — fires every N real user turns to enrich biographer context.
    // Runs after the response is saved so it never adds latency to the current turn.
    // The resulting synthetic turn pair is available starting from the next turn.
    const refreshInterval = parseInt(process.env.CHAT_CONTEXT_REFRESH_TURNS ?? '3', 10)
    if (shouldRefreshContext(realUserTurnCount, refreshInterval)) {
      try {
        const recentUserTurns = decryptedTurns
          .filter(t => t.role === 'user' && !t.is_synthetic)
          .slice(-refreshInterval)
        const queryText = recentUserTurns.map(t => t.content).filter(Boolean).join('\n\n')

        if (queryText) {
          const embeddingResult = await generateEmbedding(queryText)
          if (embeddingResult) {
            void logTokenUsage(supabase, {
              userId,
              conversationId,
              inngestFunction: 'chat-respond',
              model: 'text-embedding-3-small',
              inputTokens: embeddingResult.inputTokens,
              outputTokens: 0,
              purpose: 'context refresh embedding',
            })

            const { data: matchedEntries } = await supabase.rpc('match_entries', {
              query_embedding: JSON.stringify(embeddingResult.embedding),
              match_user_id: userId,
              match_count: 3,
            })

            if (matchedEntries && matchedEntries.length > 0) {
              const entryTexts = await Promise.all(
                (matchedEntries as Array<{ conversation_id: string }>).map(async (row) => {
                  const { data: entryTurns } = await supabase
                    .from('turns')
                    .select('content')
                    .eq('conversation_id', row.conversation_id)
                    .eq('role', 'user')
                    .eq('is_synthetic', false)
                    .order('created_at', { ascending: true })

                  if (!entryTurns || entryTurns.length === 0) return null

                  return entryTurns
                    .map(t => { try { return decrypt(t.content, process.env.MEMORY_ENCRYPTION_KEY!) } catch { return '' } })
                    .filter(Boolean)
                    .join('\n\n')
                })
              )

              const retrievedText = entryTexts.filter(Boolean).join('\n\n---\n\n')

              if (retrievedText) {
                const { model: claudeModel } = getClaudeClient()

                const addendumResult = await withUserKeyFallback(userId, supabase, userApiKey, (key) =>
                  claudeComplete({
                    system: CONTEXT_ADDENDUM_SYSTEM,
                    user: `Relevant past entries:\n${retrievedText}\n\nWrite the context note.`,
                    temperature: 0.3,
                    maxTokens: 200,
                    apiKey: key,
                  })
                )

                void logTokenUsage(supabase, {
                  userId,
                  conversationId,
                  inngestFunction: 'chat-respond',
                  model: claudeModel,
                  inputTokens: addendumResult.inputTokens,
                  outputTokens: addendumResult.outputTokens,
                  purpose: 'context refresh addendum',
                })

                // Insert synthetic turn pair — appended only, never modify earlier turns
                // (modifying earlier turns would bust the Claude prompt cache)
                await supabase.from('turns').insert([
                  {
                    conversation_id: conversationId,
                    user_id: userId,
                    role: 'user',
                    content: encrypt('[Biographer context update — internal only]', process.env.MEMORY_ENCRYPTION_KEY!),
                    channel: 'app',
                    processed: true,
                    is_synthetic: true,
                  },
                  {
                    conversation_id: conversationId,
                    user_id: userId,
                    role: 'biographer',
                    content: encrypt(addendumResult.text, process.env.MEMORY_ENCRYPTION_KEY!),
                    channel: 'app',
                    processed: true,
                    is_synthetic: true,
                  },
                ])
              }
            }
          }
        }
      } catch (err) {
        // Never let context refresh failure break the chat function
        console.error('[chat-respond] context refresh failed:', err)
      }
    }

    return { conversationId, wrap: parsed.wrap ?? false }
  }
)
