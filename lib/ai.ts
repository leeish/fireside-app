import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/crypto'

// Mini: high-frequency, speed-sensitive calls (extraction, wrap assessment)
// Claude: high-stakes calls where quality compounds (prompt generation, graph synthesis)
// chatComplete: vendor/model configurable via CHAT_VENDOR + CHAT_MODEL env vars

export function getAIClient() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = 'gpt-4o-mini'
  return { client, model }
}

export function getClaudeClient(apiKey?: string) {
  const client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY, maxRetries: 5 })
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  return { client, model }
}

// Unified completion helper for Claude — handles the API format difference from OpenAI.
export async function claudeComplete({
  system,
  user,
  temperature = 0.7,
  maxTokens = 1024,
  apiKey,
}: {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
  apiKey?: string
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { client, model } = getClaudeClient(apiKey)
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
  apiKey,
}: {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  enableCache?: boolean
  apiKey?: string
}): Promise<{ text: string; inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number }> {
  const vendor = process.env.CHAT_VENDOR ?? 'anthropic'
  const model = process.env.CHAT_MODEL ?? 'claude-haiku-4-5-20251001'

  if (vendor === 'anthropic') {
    const client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
      maxRetries: 5,
    })

    // Apply cache control if enabled
    const systemParam = enableCache
      ? [
          {
            type: 'text' as const,
            text: system
          },
        ]
      : system

    const firstUserIdx = enableCache ? messages.findIndex(m => m.role === 'user') : -1

    const messagesParam = enableCache
      ? messages.map((msg, idx) => ({
          ...msg,
          content: idx === firstUserIdx && msg.content.trim()
            ? [
                {
                  type: 'text' as const,
                  text: msg.content
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
      cache_control: { type: 'ephemeral' as const },
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
    } as any)
    const block = message.content[0]
    if (block.type !== 'text') throw new Error('Unexpected Claude response type')
    return {
      text: block.text,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
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
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
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
    cacheCreationTokens?: number
    cacheReadTokens?: number
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
      cache_creation_tokens: params.cacheCreationTokens ?? null,
      cache_read_tokens: params.cacheReadTokens ?? null,
    })
  } catch {
    // Never throw — token logging must not fail a function
  }
}

// ─── BYOK: Bring Your Own Key ─────────────────────────────────────────────

// Fetches and decrypts the user's stored Anthropic API key, or returns undefined if none.
export async function resolveApiKey(userId: string, supabase: SupabaseClient): Promise<string | undefined> {
  try {
    const { data } = await supabase
      .from('users')
      .select('anthropic_api_key')
      .eq('id', userId)
      .single()
    if (!data?.anthropic_api_key) return undefined
    return decrypt(data.anthropic_api_key, process.env.MEMORY_ENCRYPTION_KEY!)
  } catch {
    return undefined
  }
}

// Returns 'invalid' for auth/permission failures, 'quota_exceeded' for credit issues, null otherwise.
export function getApiKeyErrorType(err: unknown): 'invalid' | 'quota_exceeded' | null {
  if (typeof err !== 'object' || err === null) return null
  const e = err as Record<string, unknown>
  if (typeof e.status !== 'number') return null

  const msg = String(e.message ?? '').toLowerCase()
  // Credit/billing errors — check message before status so a 403 with "credit" goes to quota_exceeded
  if (msg.includes('credit') || msg.includes('billing') || msg.includes('quota') || msg.includes('insufficient')) {
    return 'quota_exceeded'
  }
  if (e.status === 401 || e.status === 403) {
    return 'invalid'
  }
  return null
}

// Wraps an AI call with user key. On auth/quota failure: updates DB status and retries with platform key.
export async function withUserKeyFallback<T>(
  userId: string,
  supabase: SupabaseClient,
  userApiKey: string | undefined,
  fn: (apiKey: string | undefined) => Promise<T>
): Promise<T> {
  if (!userApiKey) return fn(undefined)

  try {
    return await fn(userApiKey)
  } catch (err) {
    const errorType = getApiKeyErrorType(err)
    if (errorType) {
      try {
        await supabase
          .from('users')
          .update({ anthropic_api_key_status: errorType })
          .eq('id', userId)
      } catch {
        // Never let a DB update failure block the fallback
      }
      return fn(undefined)
    }
    throw err
  }
}
