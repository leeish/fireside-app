/**
 * One-time backfill: generate embeddings for existing entries that have none.
 *
 * Run BEFORE deploying the RAG retrieval in select-next-prompt:
 *   npx tsx --env-file=.env.local scripts/backfill-entry-embeddings.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-entry-embeddings.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * MEMORY_ENCRYPTION_KEY, and OPENAI_API_KEY in environment.
 */

import { createClient } from '@supabase/supabase-js'
import { decrypt } from '../lib/crypto'
import { generateEmbedding } from '../lib/embeddings'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const encryptionKey = process.env.MEMORY_ENCRYPTION_KEY

if (!supabaseUrl || !serviceRoleKey || !encryptionKey) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEMORY_ENCRYPTION_KEY')
  process.exit(1)
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing required env var: OPENAI_API_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)
const key = encryptionKey
const dryRun = process.argv.includes('--dry-run')

async function main() {
  if (dryRun) console.log('DRY RUN — no changes will be written.\n')

  // Fetch all entries missing embeddings
  const { data: entries, error } = await supabase
    .from('entries')
    .select('id, conversation_id')
    .is('embedding', null)

  if (error) {
    console.error('Failed to fetch entries:', error.message)
    process.exit(1)
  }

  if (!entries || entries.length === 0) {
    console.log('No entries missing embeddings.')
    return
  }

  console.log(`Found ${entries.length} entries missing embeddings.\n`)

  let embedded = 0
  let skipped = 0
  let failed = 0

  for (const entry of entries) {
    // Load user turns for this conversation
    const { data: turns } = await supabase
      .from('turns')
      .select('role, content')
      .eq('conversation_id', entry.conversation_id)
      .eq('role', 'user')
      .order('created_at', { ascending: true })

    if (!turns || turns.length === 0) {
      console.log(`  skip ${entry.id} — no user turns found`)
      skipped++
      continue
    }

    // Decrypt and concatenate user turns
    const userText = turns
      .map(t => {
        try { return decrypt(t.content, key) }
        catch { return '' }
      })
      .filter(Boolean)
      .join('\n\n')

    if (!userText) {
      console.log(`  skip ${entry.id} — no decryptable content`)
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`  would embed ${entry.id} (${userText.length} chars)`)
      embedded++
      continue
    }

    const embeddingResult = await generateEmbedding(userText)
    if (!embeddingResult) {
      console.log(`  failed ${entry.id} — embedding returned null`)
      failed++
      continue
    }

    const { error: updateError } = await supabase
      .from('entries')
      .update({ embedding: JSON.stringify(embeddingResult.embedding) })
      .eq('id', entry.id)

    if (updateError) {
      console.error(`  failed ${entry.id}:`, updateError.message)
      failed++
      continue
    }

    console.log(`  embedded ${entry.id}`)
    embedded++
  }

  const action = dryRun ? 'Would embed' : 'Embedded'
  console.log(`\nDone. ${action}: ${embedded} | Skipped: ${skipped} | Failed: ${failed}`)
}

main()
