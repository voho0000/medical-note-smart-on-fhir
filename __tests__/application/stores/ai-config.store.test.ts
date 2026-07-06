import { useAiConfigStore } from '@/src/application/stores/ai-config.store'

// Model selection moved to model-prefs.store (per-feature prefs, key-gated at
// read time) — see model-prefs.store.test.ts. This store is keys-only now.

// Mock crypto utils
jest.mock('@/src/shared/utils/crypto.utils', () => ({
  encrypt: jest.fn((value: string) => Promise.resolve(`encrypted_${value}`)),
  decrypt: jest.fn((value: string) => Promise.resolve(value.replace('encrypted_', ''))),
}))

describe('ai-config.store', () => {
  beforeEach(() => {
    // Reset store state
    useAiConfigStore.setState({
      apiKey: null,
      geminiKey: null,
      perplexityKey: null,
      claudeKey: null,
      storageType: 'localStorage',
    })

    // Clear storage
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('initial state', () => {
    it('should have null API keys initially', () => {
      const state = useAiConfigStore.getState()
      expect(state.apiKey).toBeNull()
      expect(state.geminiKey).toBeNull()
      expect(state.perplexityKey).toBeNull()
      expect(state.claudeKey).toBeNull()
    })
  })

  describe('setApiKey', () => {
    it('should set OpenAI API key', () => {
      const { setApiKey } = useAiConfigStore.getState()

      setApiKey('test-openai-key')

      expect(useAiConfigStore.getState().apiKey).toBe('test-openai-key')
    })

    it('should clear API key when set to null', () => {
      const { setApiKey } = useAiConfigStore.getState()

      setApiKey('test-key')
      setApiKey(null)

      expect(useAiConfigStore.getState().apiKey).toBeNull()
    })
  })

  describe('setGeminiKey', () => {
    it('should set Gemini API key', () => {
      const { setGeminiKey } = useAiConfigStore.getState()

      setGeminiKey('test-gemini-key')

      expect(useAiConfigStore.getState().geminiKey).toBe('test-gemini-key')
    })

    it('should clear Gemini key when set to null', () => {
      const { setGeminiKey } = useAiConfigStore.getState()

      setGeminiKey('test-key')
      setGeminiKey(null)

      expect(useAiConfigStore.getState().geminiKey).toBeNull()
    })
  })

  describe('setPerplexityKey', () => {
    it('should set Perplexity API key', () => {
      const { setPerplexityKey } = useAiConfigStore.getState()

      setPerplexityKey('test-perplexity-key')

      expect(useAiConfigStore.getState().perplexityKey).toBe('test-perplexity-key')
    })
  })

  describe('setStorageType', () => {
    it('should set storage type to sessionStorage', () => {
      const { setStorageType } = useAiConfigStore.getState()

      setStorageType('sessionStorage')

      expect(useAiConfigStore.getState().storageType).toBe('sessionStorage')
    })

    it('should set storage type to localStorage', () => {
      const { setStorageType } = useAiConfigStore.getState()

      setStorageType('sessionStorage')
      setStorageType('localStorage')

      expect(useAiConfigStore.getState().storageType).toBe('localStorage')
    })
  })

  describe('clearAllKeys', () => {
    it('should clear all API keys', () => {
      const { setApiKey, setGeminiKey, setPerplexityKey, setClaudeKey, clearAllKeys } =
        useAiConfigStore.getState()

      setApiKey('openai-key')
      setGeminiKey('gemini-key')
      setPerplexityKey('perplexity-key')
      setClaudeKey('claude-key')

      clearAllKeys()

      const state = useAiConfigStore.getState()
      expect(state.apiKey).toBeNull()
      expect(state.geminiKey).toBeNull()
      expect(state.perplexityKey).toBeNull()
      expect(state.claudeKey).toBeNull()
    })
  })
})
