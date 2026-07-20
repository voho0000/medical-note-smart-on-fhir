import { encrypt, decrypt, isEncrypted, clearSessionKey } from '@/src/shared/utils/crypto.utils'
import { webcrypto } from 'crypto'

// jsdom ships getRandomValues but not crypto.subtle — swap in Node's WebCrypto
// so the AES-GCM round-trip is tested for real
const jsdomCrypto = globalThis.crypto
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
})
afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: jsdomCrypto, configurable: true })
})

describe('crypto.utils', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    clearSessionKey()
  })

  describe('encrypt', () => {
    it('should return empty string for empty input', async () => {
      const result = await encrypt('')
      expect(result).toBe('')
    })

    it('should produce ciphertext, not the plaintext', async () => {
      const plaintext = 'test-api-key-12345'
      const encrypted = await encrypt(plaintext)
      expect(encrypted).toBeDefined()
      expect(encrypted).not.toBe(plaintext)
      expect(encrypted).not.toContain(plaintext)
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it('should throw instead of falling back to plaintext when WebCrypto is unavailable', async () => {
      Object.defineProperty(globalThis, 'crypto', { value: jsdomCrypto, configurable: true })
      try {
        await expect(encrypt('secret-key')).rejects.toBeDefined()
      } finally {
        Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
      }
    })
  })

  describe('decrypt', () => {
    it('should return empty string for empty input', async () => {
      const result = await decrypt('')
      expect(result).toBe('')
    })

    it('should round-trip encrypt → decrypt', async () => {
      const plaintext = 'test-key'
      const encrypted = await encrypt(plaintext)
      const decrypted = await decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('should return non-base64 strings as-is', async () => {
      const nonEncrypted = 'plain-text-key'
      const result = await decrypt(nonEncrypted)
      expect(result).toBe(nonEncrypted)
    })
  })

  describe('isEncrypted', () => {
    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false)
    })

    it('should return false for short strings', () => {
      expect(isEncrypted('short')).toBe(false)
    })

    it('should return false for non-base64 strings', () => {
      expect(isEncrypted('this-is-not-encrypted!')).toBe(false)
    })

    it('should return true for long base64 strings', () => {
      const longBase64 = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcA=='
      expect(isEncrypted(longBase64)).toBe(true)
    })
  })

  describe('clearSessionKey', () => {
    it('should not throw error', () => {
      expect(() => clearSessionKey()).not.toThrow()
    })
  })
})
