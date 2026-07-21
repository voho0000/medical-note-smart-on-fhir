import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { decrypt, encrypt, isEncrypted } from '@/src/shared/utils/crypto.utils'
import { DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW } from '@/src/shared/types/openai-compatible.types'

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
const CONNECTION_STORAGE_KEY = 'openai_compatible_connections_v2'
const LEGACY_CONNECTION_STORAGE_KEY = 'openai_compatible_connection_v1'

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
  if (!raw) return null
  const envelope = JSON.parse(raw)
  return envelope?.profiles?.[0]
    ? { version: envelope.version, ...envelope.profiles[0] }
    : null
}

function readStoredConnections() {
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
      openAiCompatibleProfiles: [],
      openAiCompatible: {
        enabled: false,
        baseUrl: '',
        modelId: '',
        apiKey: null,
        transport: 'direct',
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'suggested',
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
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
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'manual',
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
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
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'suggested',
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })
    })

    it('clearAllKeys removes the custom key but preserves a keyless-capable profile', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: '/ai/v1',
        modelId: 'hospital-model',
        apiKey: 'secret',
        agentMode: 'auto',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 1_721_234_567_890,
      })
      useAiConfigStore.getState().clearAllKeys()
      expect(useAiConfigStore.getState().openAiCompatible).toEqual({
        enabled: true,
        baseUrl: '/ai/v1',
        modelId: 'hospital-model',
        apiKey: null,
        transport: 'direct',
        contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
        contextWindowSource: 'manual',
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })
      expect(readStoredConnection()).toMatchObject({
        profile: {
          baseUrl: '/ai/v1',
          modelId: 'hospital-model',
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        },
        encryptedApiKey: null,
      })
    })

    it('revokes Agent trust when an encrypted custom key is cleared before hydration finishes', () => {
      const profile = {
        profileId: 'legacy',
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        apiKey: null,
        transport: 'direct' as const,
        contextWindowTokens: 32768,
        contextWindowSource: 'manual' as const,
        agentMode: 'auto' as const,
        agentCapability: 'verified' as const,
        agentCapabilityTestedAt: 100,
      }
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({
        version: 2,
        profiles: [{
          profileId: profile.profileId,
          profile: {
            enabled: profile.enabled,
            baseUrl: profile.baseUrl,
            modelId: profile.modelId,
            transport: profile.transport,
            contextWindowTokens: profile.contextWindowTokens,
            contextWindowSource: profile.contextWindowSource,
            agentMode: profile.agentMode,
            agentCapability: profile.agentCapability,
            agentCapabilityTestedAt: profile.agentCapabilityTestedAt,
          },
          encryptedApiKey: 'ciphertext:not-hydrated-yet',
        }],
      }))
      useAiConfigStore.setState({
        openAiCompatibleProfiles: [profile],
        openAiCompatible: profile,
      })

      useAiConfigStore.getState().clearAllKeys()

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        apiKey: null,
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })
      expect(readStoredConnection()).toMatchObject({
        profile: {
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        },
        encryptedApiKey: null,
      })
    })

    it('preserves or invalidates Agent capability according to the connection identity', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'model-a',
        apiKey: 'secret-a',
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
        agentMode: 'auto',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 100,
      })

      // A context-budget edit is not a new upstream runtime and must not erase a
      // successful capability probe when the current UI omits these new fields.
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'model-a',
        apiKey: 'secret-a',
        contextWindowTokens: 65536,
        contextWindowSource: 'manual',
      })
      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        agentMode: 'auto',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 100,
      })

      // A copied old timestamp does not certify a changed model. Changing the
      // runtime identity also revokes a previously manual mode by default.
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'model-b',
        apiKey: 'secret-a',
        agentMode: 'auto',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 100,
      })
      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        modelId: 'model-b',
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })

      // A new probe timestamp belongs to the edited connection and is accepted.
      await useAiConfigStore.getState().updateOpenAiCompatibleConfig('legacy', {
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'model-c',
        apiKey: 'secret-b',
        agentMode: 'auto',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 200,
      }, { confirmAgentModeForIdentityChange: true })
      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        modelId: 'model-c',
        apiKey: 'secret-b',
        agentMode: 'auto',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 200,
      })
      expect(readStoredConnection()).toMatchObject({
        profile: {
          agentMode: 'auto',
          agentCapability: 'verified',
          agentCapabilityTestedAt: 200,
        },
      })
    })

    it.each([
      ['base URL', { baseUrl: 'https://other.intra.example/v1' }],
      ['transport', { transport: 'mediprisma-gateway' as const }],
      ['API key', { apiKey: 'secret-b' }],
    ])('revokes Agent trust when the %s identity field changes', async (_label, changed) => {
      const initial = {
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'model-a',
        apiKey: 'secret-a',
        transport: 'direct' as const,
        agentMode: 'auto' as const,
        agentCapability: 'verified' as const,
        agentCapabilityTestedAt: 100,
      }
      await useAiConfigStore.getState().setOpenAiCompatibleConfig(initial)

      await useAiConfigStore.getState().updateOpenAiCompatibleConfig('legacy', {
        ...initial,
        ...changed,
      })

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        ...changed,
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
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

    it('upgrades only the old suggested window while preserving a manual value', async () => {
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({
        version: 2,
        profiles: [
          {
            profileId: 'legacy',
            profile: {
              enabled: true,
              baseUrl: 'http://127.0.0.1:11434/v1',
              modelId: 'qwen2.5vl:7b',
              transport: 'direct',
              contextWindowTokens: 15000,
              contextWindowSource: 'suggested',
            },
            encryptedApiKey: null,
          },
          {
            profileId: 'manual-small',
            profile: {
              enabled: true,
              baseUrl: 'https://small.intra.example/v1',
              modelId: 'small-context-model',
              transport: 'direct',
              contextWindowTokens: 15000,
              contextWindowSource: 'manual',
            },
            encryptedApiKey: null,
          },
        ],
      }))

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toEqual([
        expect.objectContaining({
          profileId: 'legacy',
          contextWindowTokens: 128000,
          contextWindowSource: 'suggested',
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        }),
        expect.objectContaining({
          profileId: 'manual-small',
          contextWindowTokens: 15000,
          contextWindowSource: 'manual',
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        }),
      ])
      expect(readStoredConnections()).toMatchObject({
        profiles: [
          {
            profile: {
              contextWindowTokens: 128000,
              contextWindowSource: 'suggested',
              agentMode: 'auto',
              agentCapability: 'unknown',
              agentCapabilityTestedAt: null,
            },
          },
          {
            profile: {
              contextWindowTokens: 15000,
              contextWindowSource: 'manual',
              agentMode: 'auto',
              agentCapability: 'unknown',
              agentCapabilityTestedAt: null,
            },
          },
        ],
      })
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
        version: 2,
        profileId: 'legacy',
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
          contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
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
      localStorage.setItem(LEGACY_CONNECTION_STORAGE_KEY, JSON.stringify({
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
          contextWindowTokens: DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
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
      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toEqual([
        expect.objectContaining({
          profileId: 'legacy',
          modelId: 'hospital-model',
          apiKey: 'hospital-secret-key',
        }),
      ])
      expect(readStoredConnection()).toMatchObject({
        version: 2,
        profileId: 'legacy',
        encryptedApiKey: encryptValue('hospital-secret-key'),
      })
      expect(localStorage.getItem(LEGACY_CONNECTION_STORAGE_KEY)).toBeNull()
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

    it('migrates a legacy manual-deep policy to verification-gated automatic mode', async () => {
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({
        version: 2,
        profiles: [{
          profileId: 'legacy',
          profile: {
            enabled: true,
            baseUrl: 'https://llm.intra.example/v1',
            modelId: 'hospital-model',
            transport: 'direct',
            contextWindowTokens: 32768,
            contextWindowSource: 'manual',
            agentMode: 'deep-agent',
            agentCapability: 'unknown',
            agentCapabilityTestedAt: null,
          },
          encryptedApiKey: null,
        }],
      }))

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })
      expect(readStoredConnection()).toMatchObject({
        profile: {
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        },
      })
    })

    it('revokes Agent trust when a stored custom credential cannot be decrypted', async () => {
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({
        version: 2,
        profiles: [{
          profileId: 'legacy',
          profile: {
            enabled: true,
            baseUrl: 'https://llm.intra.example/v1',
            modelId: 'hospital-model',
            transport: 'direct',
            contextWindowTokens: 32768,
            contextWindowSource: 'manual',
            agentMode: 'deep-agent',
            agentCapability: 'verified',
            agentCapabilityTestedAt: 100,
          },
          encryptedApiKey: 'ciphertext:broken',
        }],
      }))
      mockDecrypt.mockRejectedValueOnce(new Error('ciphertext cannot be decrypted'))
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        apiKey: null,
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })
      expect(readStoredConnection()).toMatchObject({
        profile: {
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        },
        encryptedApiKey: null,
      })
      warn.mockRestore()
    })

    it('revokes Agent trust when plaintext credential migration cannot encrypt the key', async () => {
      localStorage.setItem('openai_compatible_config', JSON.stringify({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        transport: 'direct',
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
        agentMode: 'deep-agent',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 100,
      }))
      localStorage.setItem('openai_compatible_api_key', 'legacy-secret!')
      mockEncrypt.mockRejectedValueOnce(new Error('WebCrypto unavailable'))
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        apiKey: null,
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })
      expect(readStoredConnection()).toMatchObject({
        profile: {
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        },
        encryptedApiKey: null,
      })
      expect(localStorage.getItem('openai_compatible_api_key')).toBeNull()
      warn.mockRestore()
    })

    it('persists a trust-revoked keyless fallback when the first migration write fails', async () => {
      localStorage.setItem('openai_compatible_config', JSON.stringify({
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        transport: 'direct',
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
        agentMode: 'deep-agent',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 100,
      }))
      localStorage.setItem('openai_compatible_api_key', 'legacy-secret!')
      const originalSetItem = Storage.prototype.setItem
      let connectionWrites = 0
      const setItem = jest.spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function (this: Storage, key, value) {
          if (key === CONNECTION_STORAGE_KEY && connectionWrites++ === 0) {
            throw new Error('transient quota error')
          }
          originalSetItem.call(this, key, value)
        })
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(connectionWrites).toBe(2)
      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        apiKey: null,
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })
      expect(readStoredConnection()).toMatchObject({
        profile: {
          agentMode: 'auto',
          agentCapability: 'unknown',
          agentCapabilityTestedAt: null,
        },
        encryptedApiKey: null,
      })
      setItem.mockRestore()
      warn.mockRestore()
    })

    it('removes custom profile and credential remnants from both storage scopes', () => {
      for (const storage of [localStorage, sessionStorage]) {
        storage.setItem('openai_compatible_config', '{"modelId":"stale"}')
        storage.setItem('openai_compatible_api_key', 'stale-ciphertext')
      }
      localStorage.setItem(LEGACY_CONNECTION_STORAGE_KEY, '{"version":1,"stale":true}')

      useAiConfigStore.getState().clearOpenAiCompatibleConfig()

      expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(LEGACY_CONNECTION_STORAGE_KEY)).toBeNull()
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
      localStorage.setItem(LEGACY_CONNECTION_STORAGE_KEY, JSON.stringify({
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

    it('adds, independently updates, disables, and deletes multiple encrypted profiles', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://legacy.intra.example/v1',
        modelId: 'legacy-model',
        apiKey: 'legacy-secret',
      })
      const secondId = await useAiConfigStore.getState().addOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://second.intra.example/v1',
        modelId: 'second-model',
        apiKey: 'second-secret',
        contextWindowTokens: 65536,
        contextWindowSource: 'manual',
      })

      expect(secondId).not.toBe('legacy')
      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toEqual([
        expect.objectContaining({ profileId: 'legacy', modelId: 'legacy-model' }),
        expect.objectContaining({ profileId: secondId, modelId: 'second-model' }),
      ])
      expect(useAiConfigStore.getState().openAiCompatible.modelId).toBe('legacy-model')
      expect(readStoredConnections()).toMatchObject({
        version: 2,
        profiles: [
          {
            profileId: 'legacy',
            profile: { modelId: 'legacy-model' },
            encryptedApiKey: encryptValue('legacy-secret'),
          },
          {
            profileId: secondId,
            profile: { modelId: 'second-model' },
            encryptedApiKey: encryptValue('second-secret'),
          },
        ],
      })
      expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).not.toContain('second-secret')

      await useAiConfigStore.getState().updateOpenAiCompatibleConfig(secondId, {
        enabled: true,
        baseUrl: 'https://second.intra.example/v1/chat/completions',
        modelId: 'second-model-v2',
        apiKey: 'second-secret-v2',
      })
      await useAiConfigStore.getState().setOpenAiCompatibleProfileEnabled(secondId, false)
      expect(useAiConfigStore.getState().openAiCompatibleProfiles[1]).toMatchObject({
        profileId: secondId,
        enabled: false,
        modelId: 'second-model-v2',
        apiKey: 'second-secret-v2',
      })

      useAiConfigStore.getState().deleteOpenAiCompatibleConfig('legacy')
      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(1)
      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        modelId: 'second-model-v2',
        apiKey: 'second-secret-v2',
      })
      expect(readStoredConnections().profiles).toEqual([
        expect.objectContaining({ profileId: secondId }),
      ])
    })

    it('enforces the ten-profile limit before writing browser storage', async () => {
      for (let index = 0; index < 10; index += 1) {
        await useAiConfigStore.getState().addOpenAiCompatibleConfig({
          enabled: true,
          baseUrl: `https://model-${index}.intra.example/v1`,
          modelId: `model-${index}`,
          apiKey: null,
        })
      }
      const before = localStorage.getItem(CONNECTION_STORAGE_KEY)

      await expect(useAiConfigStore.getState().addOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://model-10.intra.example/v1',
        modelId: 'model-10',
        apiKey: null,
      })).rejects.toThrow('At most 10')

      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(10)
      expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).toBe(before)
    })

    it('rehydrates a bounded v2 profile list and decrypts each credential', async () => {
      const profiles = Array.from({ length: 12 }, (_, index) => ({
        profileId: `profile-${index}`,
        profile: {
          enabled: true,
          baseUrl: `https://model-${index}.intra.example/v1`,
          modelId: `model-${index}`,
          transport: 'direct',
          contextWindowTokens: 32768,
          contextWindowSource: 'manual',
        },
        encryptedApiKey: encryptValue(`secret-${index}`),
      }))
      // A duplicate is ignored rather than replacing the first profile/key.
      profiles.splice(1, 0, { ...profiles[0], encryptedApiKey: encryptValue('wrong-secret') })
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({ version: 2, profiles }))

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(10)
      expect(useAiConfigStore.getState().openAiCompatibleProfiles[0]).toMatchObject({
        profileId: 'profile-0',
        apiKey: 'secret-0',
      })
      expect(useAiConfigStore.getState().openAiCompatibleProfiles[1].profileId).toBe('profile-1')
      expect(readStoredConnections().profiles).toHaveLength(10)
    })

    it('does not let a delayed profile update revive a synchronously deleted profile', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://first.intra.example/v1',
        modelId: 'first-model',
        apiKey: 'first-secret',
      })
      const secondId = await useAiConfigStore.getState().addOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://second.intra.example/v1',
        modelId: 'second-model',
        apiKey: 'second-secret',
      })
      const pendingEncryption = deferred<string>()
      mockEncrypt.mockReturnValueOnce(pendingEncryption.promise)

      const update = useAiConfigStore.getState().updateOpenAiCompatibleConfig('legacy', {
        enabled: true,
        baseUrl: 'https://updated.intra.example/v1',
        modelId: 'updated-model',
        apiKey: 'updated-secret',
      })
      useAiConfigStore.getState().deleteOpenAiCompatibleConfig('legacy')
      pendingEncryption.resolve(encryptValue('updated-secret'))

      await expect(update).rejects.toMatchObject({ name: 'AbortError' })
      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toEqual([
        expect.objectContaining({ profileId: secondId, modelId: 'second-model' }),
      ])
      expect(readStoredConnections().profiles).toEqual([
        expect.objectContaining({ profileId: secondId }),
      ])
      expect(localStorage.getItem(CONNECTION_STORAGE_KEY)).not.toContain('updated-secret')
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

    it('clears every custom credential while preserving all endpoint profiles', async () => {
      await useAiConfigStore.getState().setOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://first.intra.example/v1',
        modelId: 'first-model',
        apiKey: 'first-secret',
      })
      const secondId = await useAiConfigStore.getState().addOpenAiCompatibleConfig({
        enabled: true,
        baseUrl: 'https://second.intra.example/v1',
        modelId: 'second-model',
        apiKey: 'second-secret',
      })

      useAiConfigStore.getState().clearAllKeys()

      expect(useAiConfigStore.getState().openAiCompatibleProfiles).toEqual([
        expect.objectContaining({ profileId: 'legacy', apiKey: null }),
        expect.objectContaining({ profileId: secondId, apiKey: null }),
      ])
      expect(useAiConfigStore.getState().openAiCompatible.apiKey).toBeNull()
      expect(readStoredConnections().profiles).toEqual([
        expect.objectContaining({ profileId: 'legacy', encryptedApiKey: null }),
        expect.objectContaining({ profileId: secondId, encryptedApiKey: null }),
      ])
    })

    it('revokes legacy split-record Agent trust when keys are cleared before hydration', async () => {
      localStorage.setItem('openai_compatible_config', JSON.stringify({
        enabled: true,
        baseUrl: 'https://legacy.intra.example/v1',
        modelId: 'legacy-agent-model',
        transport: 'direct',
        contextWindowTokens: 32768,
        contextWindowSource: 'manual',
        agentMode: 'deep-agent',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 100,
      }))
      localStorage.setItem('openai_compatible_api_key', 'legacy-secret')

      useAiConfigStore.getState().clearAllKeys()

      expect(localStorage.getItem('openai_compatible_api_key')).toBeNull()
      expect(JSON.parse(
        localStorage.getItem('openai_compatible_config') ?? '{}',
      )).toMatchObject({
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })

      await useAiConfigStore.getState().rehydrateFromBrowserStorage()

      expect(useAiConfigStore.getState().openAiCompatible).toMatchObject({
        baseUrl: 'https://legacy.intra.example/v1',
        apiKey: null,
        agentMode: 'auto',
        agentCapability: 'unknown',
        agentCapabilityTestedAt: null,
      })
    })

    it('removes a legacy split-record profile when trust revocation cannot be saved', () => {
      localStorage.setItem('openai_compatible_config', JSON.stringify({
        enabled: true,
        baseUrl: 'https://legacy.intra.example/v1',
        modelId: 'legacy-agent-model',
        agentMode: 'deep-agent',
        agentCapability: 'verified',
        agentCapabilityTestedAt: 100,
      }))
      localStorage.setItem('openai_compatible_api_key', 'legacy-secret')
      const originalSetItem = Storage.prototype.setItem
      const setItem = jest.spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function (this: Storage, key, value) {
          if (key === 'openai_compatible_config') throw new Error('Quota exceeded')
          originalSetItem.call(this, key, value)
        })
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

      useAiConfigStore.getState().clearAllKeys()

      expect(localStorage.getItem('openai_compatible_api_key')).toBeNull()
      expect(localStorage.getItem('openai_compatible_config')).toBeNull()
      setItem.mockRestore()
      warn.mockRestore()
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
