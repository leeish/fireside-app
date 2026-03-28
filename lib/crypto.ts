import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

// Encrypts plaintext using AES-256-GCM.
// Returns a base64 string: iv (12 bytes) + ciphertext + auth tag (16 bytes).
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, encrypted, tag]).toString('base64')
}

// Generates a URL-safe HMAC token encoding a userId for unsubscribe links.
// Format: base64url(userId) . base64url(hmac)
export function createUnsubscribeToken(userId: string, secret: string): string {
  const payload = Buffer.from(userId).toString('base64url')
  const sig = createHmac('sha256', secret).update(userId).digest('base64url')
  return `${payload}.${sig}`
}

// Verifies and decodes an unsubscribe token. Returns userId or null if invalid.
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null
    const userId = Buffer.from(payload, 'base64url').toString('utf8')
    const expected = createHmac('sha256', secret).update(userId).digest('base64url')
    const sigBuf = Buffer.from(sig, 'base64url')
    const expBuf = Buffer.from(expected, 'base64url')
    if (sigBuf.length !== expBuf.length) return null
    if (!timingSafeEqual(sigBuf, expBuf)) return null
    return userId
  } catch {
    return null
  }
}

// Decrypts a base64 string produced by encrypt().
export function decrypt(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const buf = Buffer.from(ciphertext, 'base64')

  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(buf.length - TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(encrypted) + decipher.final('utf8')
}
