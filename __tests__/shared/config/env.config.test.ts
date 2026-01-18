import {
  ENV_CONFIG,
  CHAT_PROXY_URL,
  WHISPER_PROXY_URL,
  GEMINI_PROXY_URL,
  PROXY_CLIENT_KEY,
  hasChatProxy,
  hasWhisperProxy,
  hasGeminiProxy
} from '@/src/shared/config/env.config'

describe('env.config', () => {
  describe('ENV_CONFIG', () => {
    it('should have all required properties', () => {
      expect(ENV_CONFIG).toHaveProperty('chatProxyUrl')
      expect(ENV_CONFIG).toHaveProperty('whisperProxyUrl')
      expect(ENV_CONFIG).toHaveProperty('geminiProxyUrl')
      expect(ENV_CONFIG).toHaveProperty('proxyClientKey')
      expect(ENV_CONFIG).toHaveProperty('hasChatProxy')
      expect(ENV_CONFIG).toHaveProperty('hasWhisperProxy')
      expect(ENV_CONFIG).toHaveProperty('hasGeminiProxy')
      expect(ENV_CONFIG).toHaveProperty('smartClientId')
      expect(ENV_CONFIG).toHaveProperty('smartScopes')
      expect(ENV_CONFIG).toHaveProperty('githubPages')
      expect(ENV_CONFIG).toHaveProperty('repoBasePath')
    })

    it('should have correct SMART on FHIR configuration', () => {
      expect(ENV_CONFIG.smartClientId).toBe('my_web_app')
      expect(ENV_CONFIG.smartScopes).toBe('launch openid fhirUser patient/*.read online_access')
    })

    it('should have correct GitHub Pages configuration', () => {
      expect(ENV_CONFIG.repoBasePath).toBe('/medical-note-smart-on-fhir')
      expect(typeof ENV_CONFIG.githubPages).toBe('boolean')
    })

    it('should have boolean feature flags', () => {
      expect(typeof ENV_CONFIG.hasChatProxy).toBe('boolean')
      expect(typeof ENV_CONFIG.hasWhisperProxy).toBe('boolean')
      expect(typeof ENV_CONFIG.hasGeminiProxy).toBe('boolean')
    })
  })

  describe('Legacy exports', () => {
    it('should export CHAT_PROXY_URL', () => {
      expect(CHAT_PROXY_URL).toBe(ENV_CONFIG.chatProxyUrl)
    })

    it('should export WHISPER_PROXY_URL', () => {
      expect(WHISPER_PROXY_URL).toBe(ENV_CONFIG.whisperProxyUrl)
    })

    it('should export GEMINI_PROXY_URL', () => {
      expect(GEMINI_PROXY_URL).toBe(ENV_CONFIG.geminiProxyUrl)
    })

    it('should export PROXY_CLIENT_KEY', () => {
      expect(PROXY_CLIENT_KEY).toBe(ENV_CONFIG.proxyClientKey)
    })

    it('should export hasChatProxy', () => {
      expect(hasChatProxy).toBe(ENV_CONFIG.hasChatProxy)
    })

    it('should export hasWhisperProxy', () => {
      expect(hasWhisperProxy).toBe(ENV_CONFIG.hasWhisperProxy)
    })

    it('should export hasGeminiProxy', () => {
      expect(hasGeminiProxy).toBe(ENV_CONFIG.hasGeminiProxy)
    })
  })
})
