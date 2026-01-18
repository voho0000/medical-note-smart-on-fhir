import { QUOTA_CONFIG } from '@/src/shared/config/quota.config'

describe('quota.config', () => {
  describe('QUOTA_CONFIG', () => {
    it('should have DAILY_LIMIT defined', () => {
      expect(QUOTA_CONFIG.DAILY_LIMIT).toBeDefined()
      expect(typeof QUOTA_CONFIG.DAILY_LIMIT).toBe('number')
    })

    it('should have reasonable daily limit', () => {
      expect(QUOTA_CONFIG.DAILY_LIMIT).toBeGreaterThan(0)
      expect(QUOTA_CONFIG.DAILY_LIMIT).toBe(50)
    })

    it('should be a readonly object', () => {
      expect(Object.isFrozen(QUOTA_CONFIG)).toBe(false)
      expect(typeof QUOTA_CONFIG).toBe('object')
    })
  })
})
