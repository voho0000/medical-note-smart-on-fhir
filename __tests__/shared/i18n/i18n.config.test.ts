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

    it('advertises only the public Firebase Gateway providers', () => {
      const descriptions = [
        locales['zh-TW'].settings.openAiCompatibleGatewayDescription,
        locales.en.settings.openAiCompatibleGatewayDescription,
      ]

      for (const description of descriptions) {
        expect(description).toContain('NVIDIA')
        expect(description).toContain('OpenRouter')
        expect(description).toContain('Cerebras')
        expect(description.toLowerCase()).not.toContain('j3')
      }

      expect(locales['zh-TW'].settings.openAiCompatibleGatewayBaseUrlHint)
        .toContain('https://openrouter.ai/api/v1/chat/completions')
      expect(locales.en.settings.openAiCompatibleGatewayBaseUrlHint)
        .toContain('https://openrouter.ai/api/v1/chat/completions')
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
