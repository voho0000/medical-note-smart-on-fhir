import { encrypt, decrypt, isEncrypted, clearSessionKey } from '@/src/shared/utils/crypto.utils'

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

    it('should handle encryption', async () => {
      const plaintext = 'test-api-key-12345'
      const encrypted = await encrypt(plaintext)
      expect(encrypted).toBeDefined()
    })
  })

  describe('decrypt', () => {
    it('should return empty string for empty input', async () => {
      const result = await decrypt('')
      expect(result).toBe('')
    })

    it('should handle decryption', async () => {
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
