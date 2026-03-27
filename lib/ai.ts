import OpenAI from 'openai'

// Single shared LLM client. GPT-4o Mini to start — cheap, fast, swappable.
// To use a local model: set LOCAL_AI_URL and optionally LOCAL_AI_MODEL in .env.local
export function getAIClient() {
  const isLocal = !!process.env.LOCAL_AI_URL
  const client = new OpenAI({
    apiKey: isLocal ? 'ollama' : process.env.OPENAI_API_KEY,
    ...(isLocal && { baseURL: process.env.LOCAL_AI_URL }),
  })
  const model = isLocal ? (process.env.LOCAL_AI_MODEL ?? 'llama3.2:3b') : 'gpt-4o-mini'
  return { client, model }
}
