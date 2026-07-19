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
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        transport: 'direct',
        contextWindowTokens: 15000,
        contextWindowSource: 'suggested',
      },
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
      expect(state.openAiCompatible.enabled).toBe(false)
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

  describe('OpenAI-compatible profile', () => {
    it('normalizes, stores, disables, and removes a hospital endpoint', () => {
      const state = useAiConfigStore.getState()
      state.setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1/chat/completions/',
        modelId: ' local-model ',
        apiKey: ' local-key ',
      })

      expect(useAiConfigStore.getState().openAiCompatible).toEqual({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'local-model',
        apiKey: 'local-key',
        transport: 'direct',
        contextWindowTokens: 15000,
        contextWindowSource: 'manual',
      })

      useAiConfigStore.getState().setOpenAiCompatibleEnabled(false)
      expect(useAiConfigStore.getState().openAiCompatible.enabled).toBe(false)

      useAiConfigStore.getState().clearOpenAiCompatibleConfig()
      expect(useAiConfigStore.getState().openAiCompatible).toEqual({
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        transport: 'direct',
        contextWindowTokens: 15000,
        contextWindowSource: 'suggested',
      })
    })

    it('clearAllKeys removes the custom key but preserves a keyless-capable profile', () => {
      useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: '/ai/v1',
        modelId: 'hospital-model',
        apiKey: 'secret',
      })
      useAiConfigStore.getState().clearAllKeys()
      expect(useAiConfigStore.getState().openAiCompatible).toEqual({
        enabled: true,
        baseUrl: '/ai/v1',
        modelId: 'hospital-model',
        apiKey: null,
        transport: 'direct',
        contextWindowTokens: 15000,
        contextWindowSource: 'manual',
      })
    })

    it('stores Gateway transport only when explicitly selected', () => {
      useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        modelId: 'nvidia/nemotron-3-ultra-550b-a55b',
        apiKey: 'nvapi-test',
        transport: 'mediprisma-gateway',
      })
      expect(useAiConfigStore.getState().openAiCompatible.transport).toBe(
        'mediprisma-gateway',
      )
    })

    it('uses a conservative Nemotron fallback when runtime metadata is unavailable', () => {
      useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        modelId: 'nvidia/nemotron-3-ultra-550b-a55b',
        apiKey: 'nvapi-test',
      })
      expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(262144)
    })

    it('migrates a Qwen endpoint to its known context window unless explicitly overridden', () => {
      useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'qwen2.5:1.5b',
        apiKey: null,
      })
      expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(32768)

      useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'qwen2.5:1.5b',
        apiKey: null,
        contextWindowTokens: 24576,
      })
      expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(24576)
    })

    it('persists manual provenance even when the value equals the model suggestion', () => {
      useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'qwen2.5:7b',
        apiKey: null,
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
      })

      expect(useAiConfigStore.getState().openAiCompatible.contextWindowSource).toBe('manual')
      expect(JSON.parse(localStorage.getItem('openai_compatible_config') ?? '{}'))
        .toMatchObject({ contextWindowTokens: 32768, contextWindowSource: 'manual' })
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
