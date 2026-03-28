import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

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
}): Promise<string> {
  const { client, model } = getClaudeClient()
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [
      { role: 'user', content: user },
      { role: 'assistant', content: '{' },
    ],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected Claude response type')
  return ('{' + block.text).trim()
}

// Configurable chat completion — swap vendor/model via env vars, no deploy needed.
// CHAT_VENDOR: "anthropic" (default) | "openai"
// CHAT_MODEL:  "claude-haiku-4-5-20251001" (default) | "claude-sonnet-4-6" | "gpt-5.4-mini" | etc.
export async function chatComplete({
  system,
  user,
  temperature = 0.7,
  maxTokens = 512,
}: {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  const vendor = process.env.CHAT_VENDOR ?? 'anthropic'
  const model = process.env.CHAT_MODEL ?? 'claude-haiku-4-5-20251001'

  if (vendor === 'anthropic') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: '{' },
      ],
    })
    const block = message.content[0]
    if (block.type !== 'text') throw new Error('Unexpected Claude response type')
    return ('{' + block.text).trim()
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
        { role: 'user', content: user },
      ],
    })
    return completion.choices[0].message.content ?? ''
  }
}
