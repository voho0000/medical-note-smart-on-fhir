import { useAiConfigStore } from '@/src/application/stores/ai-config.store'

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
      storageType: 'localStorage',
      model: 'gpt-4o-mini',
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
    })

    it('should have localStorage as default storage type', () => {
      const state = useAiConfigStore.getState()
      expect(state.storageType).toBe('localStorage')
    })

    it('should have default model', () => {
      const state = useAiConfigStore.getState()
      expect(state.model).toBeDefined()
      expect(typeof state.model).toBe('string')
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

  describe('setModel', () => {
    it('should set selected model', () => {
      const { setModel } = useAiConfigStore.getState()
      
      setModel('gpt-4')
      
      expect(useAiConfigStore.getState().model).toBe('gpt-4')
    })

    it('should update model selection', () => {
      const { setModel } = useAiConfigStore.getState()
      
      setModel('gpt-4')
      setModel('gemini-pro')
      
      expect(useAiConfigStore.getState().model).toBe('gemini-pro')
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
      const { setApiKey, setGeminiKey, setPerplexityKey, clearAllKeys } = useAiConfigStore.getState()
      
      setApiKey('openai-key')
      setGeminiKey('gemini-key')
      setPerplexityKey('perplexity-key')
      
      clearAllKeys()
      
      const state = useAiConfigStore.getState()
      expect(state.apiKey).toBeNull()
      expect(state.geminiKey).toBeNull()
      expect(state.perplexityKey).toBeNull()
    })

    it('should not affect model selection', () => {
      const { setModel, clearAllKeys } = useAiConfigStore.getState()
      
      setModel('gpt-4')
      clearAllKeys()
      
      expect(useAiConfigStore.getState().model).toBe('gpt-4')
    })
  })
})
