import { locales, defaultLocale, localeNames } from '@/src/shared/i18n/i18n.config'

describe('i18n.config', () => {
  describe('locales', () => {
    it('should have en locale', () => {
      expect(locales.en).toBeDefined()
    })

    it('should have zh-TW locale', () => {
      expect(locales['zh-TW']).toBeDefined()
    })

    it('should have consistent structure', () => {
      const enKeys = Object.keys(locales.en)
      const zhKeys = Object.keys(locales['zh-TW'])
      expect(enKeys.length).toBeGreaterThan(0)
      expect(zhKeys.length).toBeGreaterThan(0)
    })

    it('describes patient summary reruns as regeneration, not refresh', () => {
      expect(locales['zh-TW'].medicalSummary.patient.regenerate).toBe('重新產生')
      expect(locales.en.medicalSummary.patient.regenerate).toBe('Regenerate')
      expect(locales['zh-TW'].safetyAlerts.patient.rescan).toBe('重新產生')
      expect(locales.en.safetyAlerts.patient.rescan).toBe('Regenerate')
    })
  })

  describe('defaultLocale', () => {
    it('should be zh-TW', () => {
      expect(defaultLocale).toBe('zh-TW')
    })
  })

  describe('localeNames', () => {
    it('should have English name', () => {
      expect(localeNames.en).toBe('English')
    })

    it('should have Chinese name', () => {
      expect(localeNames['zh-TW']).toBe('繁體中文')
    })
  })
})
