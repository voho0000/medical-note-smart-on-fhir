import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { decrypt, encrypt, isEncrypted } from '@/src/shared/utils/crypto.utils'

// Model selection moved to model-prefs.store (per-feature prefs, key-gated at
// read time) — see model-prefs.store.test.ts. This store is keys-only now.

const encryptValue = (value: string) => `ciphertext:${Array.from(value).reverse().join('')}`
const decryptValue = (value: string) => value.startsWith('ciphertext:')
  ? Array.from(value.slice('ciphertext:'.length)).reverse().join('')
  : value

jest.mock('@/src/shared/utils/crypto.utils', () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  isEncrypted: jest.fn(),
}))

const mockEncrypt = jest.mocked(encrypt)
const mockDecrypt = jest.mocked(decrypt)
const mockIsEncrypted = jest.mocked(isEncrypted)
const CONNECTION_STORAGE_KEY = 'openai_compatible_connection_v1'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function readStoredConnection() {
  const raw = localStorage.getItem(CONNECTION_STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

describe('ai-config.store', () => {
  beforeEach(() => {
    mockEncrypt.mockReset().mockImplementation(async (value) => encryptValue(value))
    mockDecrypt.mockReset().mockImplementation(async (value) => decryptValue(value))
    mockIsEncrypted.mockReset().mockImplementation(
      (value) => value.startsWith('ciphertext:'),
    )

    // Clear persistence before resetting the in-memory page state.
    localStorage.clear()
    sessionStorage.clear()

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
      credentialsHydrating: false,
      storageTypeChanging: false,
    })

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
    it('should set storage type to sessionStorage', async () => {
      const { setStorageType } = useAiConfigStore.getState()

      await setStorageType('sessionStorage')

      expect(useAiConfigStore.getState().storageType).toBe('sessionStorage')
    })

    it('should set storage type to localStorage', async () => {
      const { setStorageType } = useAiConfigStore.getState()

      await setStorageType('sessionStorage')
      await setStorageType('localStorage')

      expect(useAiConfigStore.getState().storageType).toBe('localStorage')
    })

    it('keeps the source key and preference when destination encryption fails', async () => {
      useAiConfigStore.setState({ apiKey: 'source-key', storageType: 'localStorage' })
      localStorage.setItem('api_key_storage_type', 'localStorage')
      localStorage.setItem('openai_api_key', encryptValue('source-key'))
      mockEncrypt.mockRejectedValueOnce(new Error('WebCrypto unavailable'))

      await expect(
        useAiConfigStore.getState().setStorageType('sessionStorage'),
      ).rejects.toThrow('WebCrypto unavailable')

      expect(useAiConfigStore.getState().storageType).toBe('localStorage')
      expect(useAiConfigStore.getState().storageTypeChanging).toBe(false)
      expect(localStorage.getItem('api_key_storage_type')).toBe('localStorage')
      expect(localStorage.getItem('openai_api_key')).toBe(encryptValue('source-key'))
      expect(sessionStorage.getItem('openai_api_key')).toBeNull()
    })

    it('writes the destination before removing the previous encrypted key', async () => {
      useAiConfigStore.setState({ apiKey: 'source-key', storageType: 'localStorage' })
      localStorage.setItem('api_key_storage_type', 'localStorage')
      localStorage.setItem('openai_api_key', encryptValue('source-key'))

      await useAiConfigStore.getState().setStorageType('sessionStorage')

      expect(sessionStorage.getItem('openai_api_key')).toBe(encryptValue('source-key'))
      expect(localStorage.getItem('openai_api_key')).toBeNull()
      expect(localStorage.getItem('api_key_storage_type')).toBe('sessionStorage')
    })

    it('does not rewrite or delete keys when asked for the current storage type', async () => {
      const stored = encryptValue('source-key')
      localStorage.setItem('openai_api_key', stored)

      await useAiConfigStore.getState().setStorageType('localStorage')

      expect(localStorage.getItem('openai_api_key')).toBe(stored)
      expect(mockEncrypt).not.toHaveBeenCalled()
    })
  })

  describe('OpenAI-compatible profile', () => {
    it('normalizes, stores, disables, and removes a hospital endpoint', async () => {
      const state = useAiConfigStore.getState()
      await state.setOpenAiCompatibleConfig({
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

      await useAiConfigStore.getState().setOpenAiCompatibleEnabled(false)
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

    it('clearAllKeys removes the custom key but preserves a keyless-capable profile', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
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
      expect(readStoredConnection()).toMatchObject({
        profile: { baseUrl: '/ai/v1', modelId: 'hospital-model' },
        encryptedApiKey: null,
      })
    })

    it('stores Gateway transport only when explicitly selected', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
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

    it('uses a conservative Nemotron fallback when runtime metadata is unavailable', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        modelId: 'nvidia/nemotron-3-ultra-550b-a55b',
        apiKey: 'nvapi-test',
      })
      expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(262144)
    })

    it('migrates a Qwen endpoint to its known context window unless explicitly overridden', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'qwen2.5:1.5b',
        apiKey: null,
      })
      expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(32768)

      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'qwen2.5:1.5b',
        apiKey: null,
        contextWindowTokens: 24576,
      })
      expect(useAiConfigStore.getState().openAiCompatible.contextWindowTokens).toBe(24576)
    })

    it('persists manual provenance even when the value equals the model suggestion', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: 'qwen2.5:7b',
        apiKey: null,
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
      })

      expect(useAiConfigStore.getState().openAiCompatible.contextWindowSource).toBe('manual')
      expect(readStoredConnection()).toMatchObject({
        profile: { contextWindowTokens: 32768, contextWindowSource: 'manual' },
      })
    })

    it('persists the custom profile on-device without opting cloud keys into local storage', async () => {
      useAiConfigStore.setState({ storageType: 'sessionStorage' })
      const secret = 'hospital-secret-key'

      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1/chat/completions',
        modelId: 'hospital-model',
        apiKey: secret,
        transport: 'direct',
        contextWindowTokens: 65536,
        contextWindowSource: 'manual',
      })

      const storedRaw = localStorage.getItem(CONNECTION_STORAGE_KEY)
      const storedConnection = readStoredConnection()
      expect(storedConnection).toMatchObject({
        version: 1,
        profile: { modelId: 'hospital-model', contextWindowTokens: 65536 },
      })
      expect(storedConnection.profile).not.toHaveProperty('apiKey')
      expect(storedConnection.encryptedApiKey).toMatch(/^ciphertext:/)
      expect(storedRaw).not.toContain(secret)
      expect(localStorage.getItem('openai_compatible_config')).toBeNull()
      expect(localStorage.getItem('openai_compatible_api_key')).toBeNull()
      expect(sessionStorage.getItem('openai_compatible_config')).toBeNull()
      expect(sessionStorage.getItem('openai_compatible_api_key')).toBeNull()
      expect(useAiConfigStore.getState().storageType).toBe('sessionStorage')
    })

    it('rehydrates the durable profile and encrypted key through subscriber notifications', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        apiKey: 'hospital-secret-key',
        transport: 'direct',
        contextWindowTokens: 65536,
        contextWindowSource: 'detected',
      })
      useAiConfigStore.setState({
        openAiCompatible: {
          enabled: false,
          baseUrl: '',
          modelId: '',
          apiKey: null,
          transport: 'direct',
          contextWindowTokens: 15000,
          contextWindowSource: 'suggested',
        },
      })
      const subscriber = jest.fn()
      const unsubscribe = useAiConfigStore.subscribe(subscriber)

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        apiKey: 'hospital-secret-key',
        contextWindowTokens: 65536,
        contextWindowSource: 'detected',
      })
      expect(subscriber.mock.calls.some(([state]) => (
        state.openAiCompatible.apiKey === 'hospital-secret-key'
      ))).toBe(true)
      unsubscribe()
    })

    it('restores the saved endpoint through Zustand automatic rehydration', async () => {
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({
        version: 1,
        profile: {
          enabled: true,
          baseUrl: 'https://llm.intra.example/v1',
          modelId: 'hospital-model',
          transport: 'direct',
          contextWindowTokens: 65536,
          contextWindowSource: 'detected',
        },
        encryptedApiKey: encryptValue('hospital-secret-key'),
      }))
      useAiConfigStore.setState({
        openAiCompatible: {
          enabled: false,
          baseUrl: '',
          modelId: '',
          apiKey: null,
          transport: 'direct',
          contextWindowTokens: 15000,
          contextWindowSource: 'suggested',
        },
      })

      let unsubscribe = () => {}
      const restored = new Promise<void>((resolve) => {
        unsubscribe = useAiConfigStore.subscribe((state) => {
          if (state.openAiCompatible.apiKey === 'hospital-secret-key') resolve()
        })
      })
      await useAiConfigStore.persist.rehydrate()
      await restored
      unsubscribe()

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        apiKey: 'hospital-secret-key',
      })
    })

    it('rewrites a legacy plaintext custom key as ciphertext during rehydration', async () => {
      localStorage.setItem('openai_compatible_config', JSON.stringify({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        transport: 'direct',
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
      }))
      localStorage.setItem('openai_compatible_api_key', 'legacy-secret!')

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(useAiConfigStore.getState().openAiCompatible.apiKey).toBe('legacy-secret!')
      const migrated = readStoredConnection()
      expect(migrated.encryptedApiKey).toMatch(/^ciphertext:/)
      expect(JSON.stringify(migrated)).not.toContain('legacy-secret!')
      expect(localStorage.getItem('openai_compatible_config')).toBeNull()
      expect(localStorage.getItem('openai_compatible_api_key')).toBeNull()
    })

    it('removes custom profile and credential remnants from both storage scopes', () => {
      for (const storage of [localStorage, sessionStorage]) {
        storage.setItem('openai_compatible_config', '{"modelId":"stale"}')
        storage.setItem('openai_compatible_api_key', 'stale-ciphertext')
      }
      localStorage.setItem(CONNECTION_STORAGE_KEY, '{"version":1,"stale":true}')

      useAiConfigStore.getState().clearOpenAiCompatibleConfig()

      expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).toBeNull()
      for (const storage of [localStorage, sessionStorage]) {
        expect(storage.getItem('openai_compatible_config')).toBeNull()
        expect(storage.getItem('openai_compatible_api_key')).toBeNull()
      }
    })

    it('does not save the profile or plaintext key when encryption fails', async () => {
      mockEncrypt.mockRejectedValueOnce(new Error('WebCrypto unavailable'))

      await expect(useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        apiKey: 'must-not-leak',
      })).rejects.toThrow('WebCrypto unavailable')

      expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).toBeNull()
      expect(Array.from({ length: localStorage.length }, (_, index) => (
        localStorage.getItem(localStorage.key(index) ?? '')
      )).join('')).not.toContain('must-not-leak')
      expect(JSON.stringify(useAiConfigStore.getState().openAiCompatible))
        .not.toContain('must-not-leak')
    })

    it('does not revive a custom key when clearAllKeys runs during encryption', async () => {
      const pendingEncryption = deferred<string>()
      mockEncrypt.mockReturnValueOnce(pendingEncryption.promise)

      const save = useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        apiKey: 'must-stay-cleared',
      })
      useAiConfigStore.getState().clearAllKeys()
      pendingEncryption.resolve(encryptValue('must-stay-cleared'))

      await expect(save).rejects.toMatchObject({ name: 'AbortError' })
      expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).toBeNull()
      expect(useAiConfigStore.getState().openAiCompatible.apiKey).toBeNull()
    })

    it('does not let delayed hydration overwrite a newly saved connection', async () => {
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({
        version: 1,
        profile: {
          enabled: true,
          baseUrl: 'https://old.intra.example/v1',
          modelId: 'old-model',
          transport: 'direct',
          contextWindowTokens: 32768,
          contextWindowSource: 'manual',
        },
        encryptedApiKey: encryptValue('old-secret'),
      }))
      const pendingDecrypt = deferred<string>()
      mockDecrypt.mockReturnValueOnce(pendingDecrypt.promise)

      const hydration = useAiConfigStore.getState().rehydrateFromBrowserStorage()
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://new.intra.example/v1',
        modelId: 'new-model',
        apiKey: 'new-secret',
      })
      pendingDecrypt.resolve('old-secret')
      await hydration

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        baseUrl: 'https://new.intra.example/v1',
        modelId: 'new-model',
        apiKey: 'new-secret',
      })
      expect(readStoredConnection()).toMatchObject({
        profile: { modelId: 'new-model' },
        encryptedApiKey: encryptValue('new-secret'),
      })
    })

    it('does not let a delayed legacy migration overwrite a newly saved connection', async () => {
      localStorage.setItem('openai_compatible_config', JSON.stringify({
        enabled: true,
        baseUrl: 'https://old.intra.example/v1',
        modelId: 'old-model',
        transport: 'direct',
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
      }))
      localStorage.setItem('openai_compatible_api_key', 'legacy-plaintext-secret')
      const pendingDecrypt = deferred<string>()
      const pendingMigrationEncryption = deferred<string>()
      const migrationEncryptionStarted = deferred<void>()
      mockDecrypt.mockReturnValueOnce(pendingDecrypt.promise)
      mockEncrypt.mockImplementationOnce(() => {
        migrationEncryptionStarted.resolve()
        return pendingMigrationEncryption.promise
      })

      const hydration = useAiConfigStore.getState().rehydrateFromBrowserStorage()
      pendingDecrypt.resolve('legacy-plaintext-secret')
      await migrationEncryptionStarted.promise
      expect(mockEncrypt).toHaveBeenCalledWith('legacy-plaintext-secret')

      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://new.intra.example/v1',
        modelId: 'new-model',
        apiKey: 'new-secret',
      })
      pendingMigrationEncryption.resolve(encryptValue('legacy-plaintext-secret'))
      await hydration

      expect(readStoredConnection()).toMatchObject({
        profile: { modelId: 'new-model' },
        encryptedApiKey: encryptValue('new-secret'),
      })
      expect(useAiConfigStore.getState().openAiCompatible.modelId).toBe('new-model')
    })

    it('merges unchanged credentials when one key changes during hydration', async () => {
      localStorage.setItem('api_key_storage_type', 'localStorage')
      localStorage.setItem('openai_api_key', encryptValue('old-openai-key'))
      localStorage.setItem('gemini_api_key', encryptValue('saved-gemini-key'))
      const openAiDecrypt = deferred<string>()
      const geminiDecrypt = deferred<string>()
      mockDecrypt.mockImplementation((value) => {
        if (value === encryptValue('old-openai-key')) return openAiDecrypt.promise
        if (value === encryptValue('saved-gemini-key')) return geminiDecrypt.promise
        return Promise.resolve(decryptValue(value))
      })

      const hydration = useAiConfigStore.getState().rehydrateFromBrowserStorage()
      useAiConfigStore.getState().setApiKey('new-openai-key')
      openAiDecrypt.resolve('old-openai-key')
      geminiDecrypt.resolve('saved-gemini-key')
      await hydration

      expect(useAiConfigStore.getState().apiKey).toBe('new-openai-key')
      expect(useAiConfigStore.getState().geminiKey).toBe('saved-gemini-key')
    })

    it('ignores storage-mode changes until saved cloud keys finish hydrating', async () => {
      localStorage.setItem('api_key_storage_type', 'localStorage')
      const encryptedKey = encryptValue('saved-openai-key')
      localStorage.setItem('openai_api_key', encryptedKey)
      const pendingDecrypt = deferred<string>()
      mockDecrypt.mockReturnValueOnce(pendingDecrypt.promise)

      const hydration = useAiConfigStore.getState().rehydrateFromBrowserStorage()
      expect(useAiConfigStore.getState().credentialsHydrating).toBe(true)
      useAiConfigStore.getState().setStorageType('sessionStorage')

      expect(useAiConfigStore.getState().storageType).toBe('localStorage')
      expect(localStorage.getItem('openai_api_key')).toBe(encryptedKey)
      pendingDecrypt.resolve('saved-openai-key')
      await hydration
      expect(useAiConfigStore.getState().apiKey).toBe('saved-openai-key')
    })

    it('cleans orphan credentials when no valid custom profile exists', async () => {
      localStorage.setItem('openai_compatible_config', '{not-valid-json')
      localStorage.setItem('openai_compatible_api_key', encryptValue('orphan-secret'))
      sessionStorage.setItem('openai_compatible_api_key', encryptValue('session-orphan'))

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(localStorage.getItem('openai_compatible_config')).toBeNull()
      expect(localStorage.getItem('openai_compatible_api_key')).toBeNull()
      expect(sessionStorage.getItem('openai_compatible_api_key')).toBeNull()
      expect(useAiConfigStore.getState().openAiCompatible.apiKey).toBeNull()
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

    it('clears memory even when browser storage throws during logout cleanup', () => {
      useAiConfigStore.setState({
        apiKey: 'openai-key',
        geminiKey: 'gemini-key',
        openAiCompatible: {
          ...useAiConfigStore.getState().openAiCompatible,
          apiKey: 'custom-key',
        },
      })
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const getItem = jest.spyOn(Storage.prototype, 'getItem')
        .mockImplementationOnce(() => {
          throw new Error('Storage unavailable')
        })

      expect(() => useAiConfigStore.getState().clearAllKeys()).not.toThrow()

      expect(useAiConfigStore.getState()).toMatchObject({
        apiKey: null,
        geminiKey: null,
        openAiCompatible: { apiKey: null },
      })
      getItem.mockRestore()
      warn.mockRestore()
    })

    it('removes the endpoint envelope if rewriting it without a key fails', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        apiKey: 'custom-key',
      })
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const originalSetItem = Storage.prototype.setItem
      const setItem = jest.spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function (this: Storage, key, value) {
          if (key === CONNECTION_STORAGE_KEY) throw new Error('Quota exceeded')
          originalSetItem.call(this, key, value)
        })

      useAiConfigStore.getState().clearAllKeys()

      expect(useAiConfigStore.getState().openAiCompatible.apiKey).toBeNull()
      expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).toBeNull()
      setItem.mockRestore()
      warn.mockRestore()
    })
  })
})
