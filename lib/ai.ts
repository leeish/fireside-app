import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mini: high-frequency, speed-sensitive calls (extraction, wrap assessment)
// Claude: high-stakes calls where quality compounds (prompt generation, graph synthesis)
// chatComplete: vendor/model configurable via CHAT_VENDOR + CHAT_MODEL env vars

export function getAIClient() {
  const isLocal = !!process.env.LOCAL_AI_URL
  const client = new OpenAI({
    apiKey: isLocal ? 'ollama' : process.env.OPENAI_API_KEY,
    ...(isLocal && { baseURL: process.env.LOCAL_AI_URL }),
  })
  const model = isLocal ? (process.env.LOCAL_AI_MODEL ?? 'llama3.2:3b') : 'gpt-4o-mini'
  return { client, model }
}

export function getClaudeClient() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  return { client, model }
}

// Unified completion helper for Claude — handles the API format difference from OpenAI.
export async function claudeComplete({
  system,
  user,
  temperature = 0.7,
  maxTokens = 1024,
}: {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { client, model } = getClaudeClient()
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected Claude response type')
  return {
    text: stripFences(block.text),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  }
}

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

// Configurable chat completion — swap vendor/model via env vars, no deploy needed.
// CHAT_VENDOR: "anthropic" (default) | "openai"
// CHAT_MODEL:  "claude-haiku-4-5-20251001" (default) | "claude-sonnet-4-6" | "gpt-5.4-mini" | etc.
// Accepts a proper alternating messages array as the API recommends for multi-turn chat.
export async function chatComplete({
  system,
  messages,
  temperature = 0.7,
  maxTokens = 512,
  enableCache = false,
}: {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  enableCache?: boolean
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const vendor = process.env.CHAT_VENDOR ?? 'anthropic'
  const model = process.env.CHAT_MODEL ?? 'claude-haiku-4-5-20251001'

  if (vendor === 'anthropic') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Apply cache control if enabled
    const systemParam = enableCache
      ? [
          {
            type: 'text' as const,
            text: system,
            cache_control: { type: 'ephemeral' as const },
          },
        ]
      : system

    const messagesParam = enableCache
      ? messages.map((msg, idx) => ({
          ...msg,
          content: idx === 0
            ? [
                {
                  type: 'text' as const,
                  text: msg.content,
                  cache_control: { type: 'ephemeral' as const },
                },
              ]
            : msg.content,
        }))
      : messages

    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemParam,
      messages: messagesParam,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              response: { type: 'string' },
              wrap: { type: 'boolean' },
            },
            required: ['response', 'wrap'],
            additionalProperties: false,
          },
        },
      },
    })
    const block = message.content[0]
    if (block.type !== 'text') throw new Error('Unexpected Claude response type')
    return {
      text: block.text,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    }
  } else {
    // OpenAI — use json_object response format so output is always parseable
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model,
      temperature,
      store: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    })
    return {
      text: completion.choices[0].message.content ?? '',
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    }
  }
}

export async function logTokenUsage(
  supabase: SupabaseClient,
  params: {
    userId: string
    conversationId?: string | null
    inngestFunction: string
    model: string
    inputTokens: number
    outputTokens: number
    purpose: string
  }
): Promise<void> {
  try {
    await supabase.from('token_usage').insert({
      user_id: params.userId,
      conversation_id: params.conversationId ?? null,
      inngest_function: params.inngestFunction,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      purpose: params.purpose,
    })
  } catch {
    // Never throw — token logging must not fail a function
  }
}
