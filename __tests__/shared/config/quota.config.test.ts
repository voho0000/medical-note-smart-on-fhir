import { QUOTA_CONFIG } from '@/src/shared/config/quota.config'

describe('quota.config', () => {
  describe('QUOTA_CONFIG', () => {
    it('should have DAILY_LIMIT defined', () => {
      expect(QUOTA_CONFIG.DAILY_LIMIT).toBeDefined()
      expect(typeof QUOTA_CONFIG.DAILY_LIMIT).toBe('number')
    })

    it('should have reasonable daily limit (positive integer)', () => {
      // Don't pin the exact value — it's policy and gets adjusted as cost
      // / usage data comes in. Just guard against accidentally setting it
      // to 0 (locks everyone out) or negative.
      expect(QUOTA_CONFIG.DAILY_LIMIT).toBeGreaterThan(0)
      expect(Number.isInteger(QUOTA_CONFIG.DAILY_LIMIT)).toBe(true)
    })

    it('should be a typed const object', () => {
      // `as const` gives compile-time immutability; we don't Object.freeze
      // at runtime so this stays false. The test just documents the
      // current contract.
      expect(typeof QUOTA_CONFIG).toBe('object')
      expect(QUOTA_CONFIG).not.toBeNull()
    })
  })
})
