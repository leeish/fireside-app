/**
 * One-time migration: encrypt existing plaintext biographer turns.
 *
 * Run BEFORE deploying the code that encrypts new biographer turns:
 *   npx tsx scripts/migrate-biographer-turns.ts
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and MEMORY_ENCRYPTION_KEY
 * to be set in the environment (or a .env.local file loaded via --env-file).
 */

import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '../lib/crypto'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const encryptionKey = process.env.MEMORY_ENCRYPTION_KEY

if (!supabaseUrl || !serviceRoleKey || !encryptionKey) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEMORY_ENCRYPTION_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)
const key = encryptionKey
const dryRun = process.argv.includes('--dry-run')

async function main() {
  const PAGE_SIZE = 500
  let offset = 0
  let total = 0
  let encrypted = 0
  let skipped = 0

  if (dryRun) console.log('DRY RUN — no changes will be written.\n')
  console.log('Fetching biographer turns...')

  while (true) {
    const { data: rows, error } = await supabase
      .from('turns')
      .select('id, content')
      .eq('role', 'biographer')
      .range(offset, offset + PAGE_SIZE - 1)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching turns:', error.message)
      process.exit(1)
    }

    if (!rows || rows.length === 0) break

    total += rows.length

    for (const row of rows) {
      let alreadyEncrypted = false
      try {
        decrypt(row.content, key)
        alreadyEncrypted = true
      } catch {
        // plaintext — needs encrypting
      }

      if (alreadyEncrypted) {
        skipped++
        continue
      }

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('turns')
          .update({ content: encrypt(row.content, key) })
          .eq('id', row.id)

        if (updateError) {
          console.error(`Failed to update turn ${row.id}:`, updateError.message)
          process.exit(1)
        }
      }

      encrypted++
    }

    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const action = dryRun ? 'Would encrypt' : 'Encrypted'
  console.log(`Done. Total: ${total} | ${action}: ${encrypted} | Already encrypted (skipped): ${skipped}`)
}

main()
