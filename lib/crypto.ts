import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

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
