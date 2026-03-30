import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, createUnsubscribeToken, verifyUnsubscribeToken } from './crypto'
import { randomBytes } from 'crypto'

describe('crypto', () => {
  // Generate consistent test keys (64 hex chars = 32 bytes for AES-256)
  const testKey = randomBytes(32).toString('hex')
  const otherKey = randomBytes(32).toString('hex')
  const testSecret = 'test-secret-key'
  const wrongSecret = 'wrong-secret-key'

  describe('encrypt/decrypt', () => {
    it('roundtrips plaintext with correct key', () => {
      const plaintext = 'Hello, this is a secret message'
      const ciphertext = encrypt(plaintext, testKey)
      const decrypted = decrypt(ciphertext, testKey)
      expect(decrypted).toBe(plaintext)
    })

    it('handles empty string', () => {
      const plaintext = ''
      const ciphertext = encrypt(plaintext, testKey)
      const decrypted = decrypt(ciphertext, testKey)
      expect(decrypted).toBe(plaintext)
    })

    it('handles unicode and special characters', () => {
      const plaintext = 'こんにちは 🎉 !@#$%^&*()'
      const ciphertext = encrypt(plaintext, testKey)
      const decrypted = decrypt(ciphertext, testKey)
      expect(decrypted).toBe(plaintext)
    })

    it('produces different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'Same message twice'
      const cipher1 = encrypt(plaintext, testKey)
      const cipher2 = encrypt(plaintext, testKey)
      expect(cipher1).not.toBe(cipher2)
      // But both decrypt to the same plaintext
      expect(decrypt(cipher1, testKey)).toBe(plaintext)
      expect(decrypt(cipher2, testKey)).toBe(plaintext)
    })

    it('fails to decrypt with wrong key', () => {
      const plaintext = 'Secret message'
      const ciphertext = encrypt(plaintext, testKey)
      expect(() => decrypt(ciphertext, otherKey)).toThrow()
    })

    it('fails to decrypt tampered ciphertext', () => {
      const plaintext = 'Secret message'
      const ciphertext = encrypt(plaintext, testKey)
      const buffer = Buffer.from(ciphertext, 'base64')
      // Flip a bit in the middle
      buffer[Math.floor(buffer.length / 2)] ^= 0x01
      const tamperedCiphertext = buffer.toString('base64')
      expect(() => decrypt(tamperedCiphertext, testKey)).toThrow()
    })

    it('fails on malformed base64', () => {
      expect(() => decrypt('not-valid-base64!!!', testKey)).toThrow()
    })
  })

  describe('unsubscribe token', () => {
    it('roundtrips userId', () => {
      const userId = 'user-123-abc'
      const token = createUnsubscribeToken(userId, testSecret)
      const decoded = verifyUnsubscribeToken(token, testSecret)
      expect(decoded).toBe(userId)
    })

    it('returns null with wrong secret', () => {
      const userId = 'user-123-abc'
      const token = createUnsubscribeToken(userId, testSecret)
      const decoded = verifyUnsubscribeToken(token, wrongSecret)
      expect(decoded).toBeNull()
    })

    it('returns null with tampered payload', () => {
      const userId = 'user-123-abc'
      const token = createUnsubscribeToken(userId, testSecret)
      const [payload, sig] = token.split('.')
      const tamperedPayload = Buffer.from(payload, 'base64url')
      tamperedPayload[0] ^= 0x01
      const tamperedToken = `${tamperedPayload.toString('base64url')}.${sig}`
      const decoded = verifyUnsubscribeToken(tamperedToken, testSecret)
      expect(decoded).toBeNull()
    })

    it('returns null with tampered signature', () => {
      const userId = 'user-123-abc'
      const token = createUnsubscribeToken(userId, testSecret)
      const [payload, sig] = token.split('.')
      const tamperedSig = Buffer.from(sig, 'base64url')
      tamperedSig[0] ^= 0x01
      const tamperedToken = `${payload}.${tamperedSig.toString('base64url')}`
      const decoded = verifyUnsubscribeToken(tamperedToken, testSecret)
      expect(decoded).toBeNull()
    })

    it('returns null on malformed token', () => {
      expect(verifyUnsubscribeToken('invalid-token-format', testSecret)).toBeNull()
      expect(verifyUnsubscribeToken('no-dot-here', testSecret)).toBeNull()
      expect(verifyUnsubscribeToken('', testSecret)).toBeNull()
    })

    it('handles userId with special characters', () => {
      const userId = 'user@example.com'
      const token = createUnsubscribeToken(userId, testSecret)
      const decoded = verifyUnsubscribeToken(token, testSecret)
      expect(decoded).toBe(userId)
    })

    it('handles very long userId', () => {
      const userId = 'a'.repeat(1000)
      const token = createUnsubscribeToken(userId, testSecret)
      const decoded = verifyUnsubscribeToken(token, testSecret)
      expect(decoded).toBe(userId)
    })
  })
})
