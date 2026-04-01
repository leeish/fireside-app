import OpenAI from 'openai'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_INPUT_CHARS = 6000

// Generates a vector embedding for the given text using OpenAI text-embedding-3-small.
// Returns null on failure — a missing embedding should never block an entry from saving.
// The backfill script (scripts/backfill-entry-embeddings.ts) catches any persistent misses.
export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const isLocal = !!process.env.LOCAL_AI_URL
    if (isLocal) return null  // local dev — skip embeddings

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const input = text.slice(0, MAX_INPUT_CHARS).trim()
    if (!input) return null

    const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input })
    return response.data[0].embedding
  } catch (err) {
    console.error('[embeddings] generateEmbedding failed:', err)
    return null
  }
}
