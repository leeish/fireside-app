import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

// Mini: high-frequency, speed-sensitive calls (chat responses, simple extraction)
// Claude: high-stakes calls where quality compounds (prompt generation, graph synthesis)

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
    messages: [{ role: 'user', content: user }],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected Claude response type')
  return block.text.trim()
}
