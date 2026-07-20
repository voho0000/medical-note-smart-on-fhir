/**
 * AI Configuration Store (Zustand)
 *
 * API keys + their persistence mode. Model selection moved OUT of this store:
 * chat/insights prefs live in model-prefs.store, medical-summary and
 * safety-alerts keep their own pref stores — each picked in-panel via the
 * shared ModelPicker and key-gated at read time.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { decrypt, encrypt, isEncrypted } from '@/src/shared/utils/crypto.utils'
import { isUsableApiKey, sanitizeApiKey } from '@/src/shared/utils/api-key.utils'
import type { OpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'
import {
  createEmptyOpenAiCompatibleConfig,
  normalizeOpenAiCompatibleContextWindow,
  normalizeOpenAiCompatibleContextWindowSource,
  normalizeOpenAiCompatibleTransport,
} from '@/src/shared/types/openai-compatible.types'
import { normalizeOpenAiCompatibleBaseUrl } from '@/src/shared/utils/openai-compatible.utils'

type StorageType = 'localStorage' | 'sessionStorage'

interface AiConfigState {
  // API Keys
  apiKey: string | null
  geminiKey: string | null
  perplexityKey: string | null
  claudeKey: string | null
  openAiCompatible: OpenAiCompatibleConfig
  storageType: StorageType
  credentialsHydrating: boolean
  storageTypeChanging: boolean

  // Actions
  setApiKey: (key: string | null) => void
  setGeminiKey: (key: string | null) => void
  setPerplexityKey: (key: string | null) => void
  setClaudeKey: (key: string | null) => void
  setOpenAiCompatibleConfig: (config: OpenAiCompatibleConfig) => Promise<void>
  setOpenAiCompatibleEnabled: (enabled: boolean) => Promise<void>
  clearOpenAiCompatibleConfig: () => void
  setStorageType: (type: StorageType) => Promise<void>
  clearAllKeys: () => void
  rehydrateFromBrowserStorage: () => Promise<void>
}

const STORAGE_KEYS = {
  OPENAI_API_KEY: 'openai_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  PERPLEXITY_API_KEY: 'perplexity_api_key',
  CLAUDE_API_KEY: 'claude_api_key',
  OPENAI_COMPATIBLE_API_KEY: 'openai_compatible_api_key',
  OPENAI_COMPATIBLE_CONFIG: 'openai_compatible_config',
  OPENAI_COMPATIBLE_CONNECTION: 'openai_compatible_connection_v1',
  STORAGE_TYPE: 'api_key_storage_type',
}

type CredentialField = 'apiKey' | 'geminiKey' | 'perplexityKey' | 'claudeKey'

const credentialRevisions: Record<CredentialField, number> = {
  apiKey: 0,
  geminiKey: 0,
  perplexityKey: 0,
  claudeKey: 0,
}
let customConnectionRevision = 0
let storageTypeRevision = 0
let aiConfigHydrationRevision = 0

const bumpCredentialRevision = (field: CredentialField) => {
  credentialRevisions[field] += 1
  return credentialRevisions[field]
}

const bumpAllCredentialRevisions = () => {
  for (const field of Object.keys(credentialRevisions) as CredentialField[]) {
    credentialRevisions[field] += 1
  }
}

const createStaleOperationError = () => {
  const error = new Error('A newer credential operation replaced this save')
  error.name = 'AbortError'
  return error
}

// Helper to get storage
const getStorage = (type: StorageType) => {
  if (typeof window === 'undefined') return null
  return type === 'localStorage' ? window.localStorage : window.sessionStorage
}

interface LoadedCredential {
  raw: string | null
  value: string | null
  needsEncryption: boolean
  invalid: boolean
}

/** Read/decrypt only. Cleanup and plaintext migration happen later behind a
 * revision + compare-and-set guard, so an old async result cannot overwrite a
 * key the user just saved. */
const decodeStoredCredential = async (
  raw: string | null,
  label: string,
): Promise<LoadedCredential> => {
  if (!raw) return { raw: null, value: null, needsEncryption: false, invalid: false }

  try {
    const decrypted = await decrypt(raw)
    // A stored key with non-Latin1 chars (e.g. a chat message pasted into the
    // key field) would crash the provider's Headers construction. Ignore + clear
    // it so the app falls back to the proxy instead of an opaque error.
    if (!isUsableApiKey(decrypted)) {
      return { raw, value: null, needsEncryption: false, invalid: true }
    }
    return {
      raw,
      value: decrypted,
      needsEncryption: !isEncrypted(raw),
      invalid: false,
    }
  } catch (error) {
    console.warn(`Failed to decrypt ${label}:`, error)
    return { raw, value: null, needsEncryption: false, invalid: true }
  }
}

const loadEncryptedKey = async (
  storageType: StorageType,
  key: string,
): Promise<LoadedCredential> => {
  const storage = getStorage(storageType)
  return decodeStoredCredential(storage?.getItem(key) ?? null, key)
}

const finishLoadedCredential = async (
  storageType: StorageType,
  key: string,
  loaded: LoadedCredential,
  isCurrent: () => boolean,
) => {
  if (!loaded.raw) return
  const storage = getStorage(storageType)
  if (!storage) return

  if (loaded.invalid) {
    if (isCurrent() && storage.getItem(key) === loaded.raw) storage.removeItem(key)
    return
  }
  if (!loaded.needsEncryption || !loaded.value) return

  try {
    const encrypted = await encrypt(loaded.value)
    if (isCurrent() && storage.getItem(key) === loaded.raw) {
      storage.setItem(key, encrypted)
    }
  } catch (error) {
    console.warn(`Failed to encrypt legacy ${key}:`, error)
    // Never keep a legacy plaintext credential when it cannot be encrypted.
    if (isCurrent() && storage.getItem(key) === loaded.raw) storage.removeItem(key)
  }
}

// Helper to save encrypted cloud-provider keys. `isCurrent` prevents an old
// PBKDF2 operation from reviving a key after clear/logout or a newer edit.
const saveEncryptedKey = async (
  storageType: StorageType,
  key: string,
  value: string | null,
  isCurrent: () => boolean = () => true,
) => {
  const storage = getStorage(storageType)
  if (!storage || !isCurrent()) return

  if (value === null) {
    storage.removeItem(key)
  } else {
    try {
      const encrypted = await encrypt(value)
      if (isCurrent()) storage.setItem(key, encrypted)
    } catch (error) {
      console.warn(`Failed to encrypt ${key}:`, error)
      throw error
    }
  }
}

type StoredOpenAiCompatibleConfig = Pick<
  OpenAiCompatibleConfig,
  | 'enabled'
  | 'baseUrl'
  | 'modelId'
  | 'contextWindowTokens'
  | 'contextWindowSource'
  | 'transport'
>

interface StoredOpenAiCompatibleConnection {
  version: 1
  profile: StoredOpenAiCompatibleConfig
  encryptedApiKey: string | null
}

const normalizeStoredOpenAiCompatibleConfig = (
  value: unknown,
): StoredOpenAiCompatibleConfig | null => {
  if (!value || typeof value !== 'object') return null
  const parsed = value as Partial<StoredOpenAiCompatibleConfig>
  if (typeof parsed.baseUrl !== 'string' || typeof parsed.modelId !== 'string') {
    return null
  }
  try {
    const baseUrl = normalizeOpenAiCompatibleBaseUrl(parsed.baseUrl)
    const modelId = parsed.modelId.trim()
    if (!modelId) return null
    return {
      enabled: parsed.enabled === true,
      baseUrl,
      modelId,
      transport: normalizeOpenAiCompatibleTransport(parsed.transport),
      contextWindowTokens: normalizeOpenAiCompatibleContextWindow(
        parsed.contextWindowTokens,
        modelId,
      ),
      contextWindowSource: normalizeOpenAiCompatibleContextWindowSource(
        parsed.contextWindowSource,
        true,
      ),
    }
  } catch {
    return null
  }
}

const toStoredOpenAiCompatibleConfig = (
  config: OpenAiCompatibleConfig,
): StoredOpenAiCompatibleConfig => ({
  enabled: config.enabled,
  baseUrl: config.baseUrl,
  modelId: config.modelId,
  transport: normalizeOpenAiCompatibleTransport(config.transport),
  contextWindowTokens: normalizeOpenAiCompatibleContextWindow(
    config.contextWindowTokens,
    config.modelId,
  ),
  contextWindowSource: normalizeOpenAiCompatibleContextWindowSource(
    config.contextWindowSource,
    Boolean(config.baseUrl && config.modelId),
  ),
})

interface LegacyOpenAiCompatibleProfile {
  storageType: StorageType
  raw: string
  profile: StoredOpenAiCompatibleConfig
  credentialRaw: string | null
}

const loadLegacyOpenAiCompatibleProfile = (
  storageType: StorageType,
): LegacyOpenAiCompatibleProfile | null => {
  const storage = getStorage(storageType)
  const raw = storage?.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG)
  if (!storage || !raw) return null
  try {
    const profile = normalizeStoredOpenAiCompatibleConfig(JSON.parse(raw))
    if (!profile) return null
    return {
      storageType,
      raw,
      profile,
      credentialRaw: storage.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY),
    }
  } catch {
    return null
  }
}

const parseStoredOpenAiCompatibleConnection = (
  raw: string | null,
): StoredOpenAiCompatibleConnection | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredOpenAiCompatibleConnection>
    const profile = normalizeStoredOpenAiCompatibleConfig(parsed.profile)
    if (
      parsed.version !== 1 ||
      !profile ||
      !(parsed.encryptedApiKey === null || typeof parsed.encryptedApiKey === 'string')
    ) return null
    return { version: 1, profile, encryptedApiKey: parsed.encryptedApiKey }
  } catch {
    return null
  }
}

const serializeOpenAiCompatibleConnection = (
  profile: StoredOpenAiCompatibleConfig,
  encryptedApiKey: string | null,
) => JSON.stringify({ version: 1, profile, encryptedApiKey })

const clearLegacyOpenAiCompatibleStorage = () => {
  for (const storageType of ['localStorage', 'sessionStorage'] as const) {
    const storage = getStorage(storageType)
    storage?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG)
    storage?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY)
  }
}

/** The endpoint profile and its ciphertext share one versioned localStorage
 * record, avoiding a profile/key mismatch if a write fails. */
const persistOpenAiCompatibleOnDevice = async (
  config: OpenAiCompatibleConfig,
  expectedRevision: number,
) => {
  const storage = getStorage('localStorage')
  if (!storage) return

  const encryptedApiKey = config.apiKey ? await encrypt(config.apiKey) : null
  if (expectedRevision !== customConnectionRevision) throw createStaleOperationError()

  storage.setItem(
    STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
    serializeOpenAiCompatibleConnection(
      toStoredOpenAiCompatibleConfig(config),
      encryptedApiKey,
    ),
  )
  // The caller checks the same revision again before publishing state. A
  // clear/logout during either async boundary therefore cannot be undone.
  clearLegacyOpenAiCompatibleStorage()
}

const normalizeOpenAiCompatibleConfig = (
  config: OpenAiCompatibleConfig,
): OpenAiCompatibleConfig => ({
  enabled: config.enabled,
  baseUrl: normalizeOpenAiCompatibleBaseUrl(config.baseUrl),
  modelId: config.modelId.trim(),
  apiKey: sanitizeApiKey(config.apiKey),
  transport: normalizeOpenAiCompatibleTransport(config.transport),
  contextWindowTokens: normalizeOpenAiCompatibleContextWindow(
    config.contextWindowTokens,
    config.modelId,
  ),
  contextWindowSource: normalizeOpenAiCompatibleContextWindowSource(
    config.contextWindowSource,
    Boolean(config.baseUrl && config.modelId),
  ),
})

export const useAiConfigStore = create<AiConfigState>()(
  persist(
    (set, get) => ({
      // Cloud-provider keys use sessionStorage by default for shared-workstation
      // safety. The explicitly saved custom endpoint is handled independently
      // and persists as a local profile plus an encrypted credential.
      apiKey: null,
      geminiKey: null,
      perplexityKey: null,
      claudeKey: null,
      openAiCompatible: createEmptyOpenAiCompatibleConfig(),
      storageType: 'sessionStorage',
      credentialsHydrating: false,
      storageTypeChanging: false,

      // Actions. Removing a key needs no model bookkeeping here — every model
      // pref is key-gated at read time (useEffectiveModel / resolvedModelId),
      // so stranded premium picks land on the feature's free default.
      setApiKey: (key) => {
        const revision = bumpCredentialRevision('apiKey')
        const clean = sanitizeApiKey(key)
        const storageType = get().storageType
        set({ apiKey: clean })
        saveEncryptedKey(
          storageType,
          STORAGE_KEYS.OPENAI_API_KEY,
          clean,
          () => revision === credentialRevisions.apiKey && get().storageType === storageType,
        ).catch(console.error)
      },

      setGeminiKey: (key) => {
        const revision = bumpCredentialRevision('geminiKey')
        const clean = sanitizeApiKey(key)
        const storageType = get().storageType
        set({ geminiKey: clean })
        saveEncryptedKey(
          storageType,
          STORAGE_KEYS.GEMINI_API_KEY,
          clean,
          () => revision === credentialRevisions.geminiKey && get().storageType === storageType,
        ).catch(console.error)
      },

      setPerplexityKey: (key) => {
        const revision = bumpCredentialRevision('perplexityKey')
        const clean = sanitizeApiKey(key)
        const storageType = get().storageType
        set({ perplexityKey: clean })
        saveEncryptedKey(
          storageType,
          STORAGE_KEYS.PERPLEXITY_API_KEY,
          clean,
          () => revision === credentialRevisions.perplexityKey && get().storageType === storageType,
        ).catch(console.error)
      },

      setClaudeKey: (key) => {
        const revision = bumpCredentialRevision('claudeKey')
        const clean = sanitizeApiKey(key)
        const storageType = get().storageType
        set({ claudeKey: clean })
        saveEncryptedKey(
          storageType,
          STORAGE_KEYS.CLAUDE_API_KEY,
          clean,
          () => revision === credentialRevisions.claudeKey && get().storageType === storageType,
        ).catch(console.error)
      },

      setOpenAiCompatibleConfig: async (config) => {
        const revision = ++customConnectionRevision
        const next = normalizeOpenAiCompatibleConfig(config)
        await persistOpenAiCompatibleOnDevice(next, revision)
        if (revision !== customConnectionRevision) throw createStaleOperationError()
        set({ openAiCompatible: next })
      },

      setOpenAiCompatibleEnabled: async (enabled) => {
        const revision = ++customConnectionRevision
        const next = { ...get().openAiCompatible, enabled }
        await persistOpenAiCompatibleOnDevice(next, revision)
        if (revision !== customConnectionRevision) throw createStaleOperationError()
        set({ openAiCompatible: next })
      },

      clearOpenAiCompatibleConfig: () => {
        customConnectionRevision += 1
        getStorage('localStorage')?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION)
        clearLegacyOpenAiCompatibleStorage()
        set({ openAiCompatible: createEmptyOpenAiCompatibleConfig() })
      },
      
      setStorageType: async (type) => {
        // Stored cloud keys have not reached memory yet; migrating from null
        // values here would erase them. The Settings UI is disabled as well,
        // but keep the action safe for programmatic callers.
        const currentState = get()
        if (
          currentState.credentialsHydrating ||
          currentState.storageTypeChanging ||
          type === currentState.storageType
        ) return

        const migrationStorageRevision = ++storageTypeRevision
        bumpAllCredentialRevisions()
        const migrationFieldRevisions = { ...credentialRevisions }
        const oldType = currentState.storageType
        const keyValues = [
          [STORAGE_KEYS.OPENAI_API_KEY, currentState.apiKey],
          [STORAGE_KEYS.GEMINI_API_KEY, currentState.geminiKey],
          [STORAGE_KEYS.PERPLEXITY_API_KEY, currentState.perplexityKey],
          [STORAGE_KEYS.CLAUDE_API_KEY, currentState.claudeKey],
        ] as const
        set({ storageTypeChanging: true })

        try {
          const encryptedValues = await Promise.all(keyValues.map(async ([key, value]) => (
            [key, value ? await encrypt(value) : null] as const
          )))
          const revisionsStillCurrent = (
            migrationStorageRevision === storageTypeRevision &&
            migrationFieldRevisions.apiKey === credentialRevisions.apiKey &&
            migrationFieldRevisions.geminiKey === credentialRevisions.geminiKey &&
            migrationFieldRevisions.perplexityKey === credentialRevisions.perplexityKey &&
            migrationFieldRevisions.claudeKey === credentialRevisions.claudeKey
          )
          if (!revisionsStillCurrent) return

          const oldStorage = getStorage(oldType)
          const newStorage = getStorage(type)
          if (!oldStorage || !newStorage || typeof window === 'undefined') return
          const previousDestination = encryptedValues.map(([key]) => (
            [key, newStorage.getItem(key)] as const
          ))
          const previousPreference = window.localStorage.getItem(STORAGE_KEYS.STORAGE_TYPE)

          try {
            // Stage the entire destination first. Source values and the saved
            // preference remain intact if encryption or any write fails.
            for (const [key, encrypted] of encryptedValues) {
              if (encrypted === null) newStorage.removeItem(key)
              else newStorage.setItem(key, encrypted)
            }
            window.localStorage.setItem(STORAGE_KEYS.STORAGE_TYPE, type)
          } catch (error) {
            try {
              for (const [key, previous] of previousDestination) {
                if (previous === null) newStorage.removeItem(key)
                else newStorage.setItem(key, previous)
              }
              if (previousPreference === null) {
                window.localStorage.removeItem(STORAGE_KEYS.STORAGE_TYPE)
              } else {
                window.localStorage.setItem(STORAGE_KEYS.STORAGE_TYPE, previousPreference)
              }
            } catch {
              // Best-effort rollback; the untouched source remains authoritative.
            }
            throw error
          }

          set({ storageType: type })
          // Cleanup happens only after the durable destination and preference
          // are committed. A failure here leaves harmless duplicate ciphertext.
          try {
            for (const [key] of keyValues) oldStorage.removeItem(key)
          } catch (error) {
            console.warn('Failed to clean previous credential storage:', error)
          }
        } finally {
          if (migrationStorageRevision === storageTypeRevision) {
            set({ storageTypeChanging: false })
          }
        }
      },
      
      clearAllKeys: () => {
        storageTypeRevision += 1
        customConnectionRevision += 1
        bumpAllCredentialRevisions()

        // Memory is cleared first so StorageError cannot leave usable keys in
        // the running app or interrupt an auth/logout cleanup chain.
        set((state) => ({
          apiKey: null,
          geminiKey: null,
          perplexityKey: null,
          claudeKey: null,
          openAiCompatible: { ...state.openAiCompatible, apiKey: null },
          storageTypeChanging: false,
        }))

        // Preserve the custom endpoint itself while removing its credential
        // from the same atomic record. If rewriting fails, remove the record so
        // a logout can never leave a recoverable key behind.
        let deviceStorage: Storage | null = null
        try {
          deviceStorage = getStorage('localStorage')
          const storedConnectionRaw = deviceStorage?.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
          ) ?? null
          const storedConnection = parseStoredOpenAiCompatibleConnection(storedConnectionRaw)
          if (deviceStorage && storedConnectionRaw) {
            if (storedConnection) {
              deviceStorage.setItem(
                STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
                serializeOpenAiCompatibleConnection(storedConnection.profile, null),
              )
            } else {
              deviceStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION)
            }
          }
        } catch (error) {
          try {
            deviceStorage?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION)
          } catch {
            // Best effort only; memory has already been cleared above.
          }
          console.warn('Failed to clear stored custom endpoint credential:', error)
        }

        for (const type of ['localStorage', 'sessionStorage'] as const) {
          try {
            const storage = getStorage(type)
            storage?.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
            storage?.removeItem(STORAGE_KEYS.GEMINI_API_KEY)
            storage?.removeItem(STORAGE_KEYS.PERPLEXITY_API_KEY)
            storage?.removeItem(STORAGE_KEYS.CLAUDE_API_KEY)
            storage?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY)
          } catch (error) {
            console.warn(`Failed to clear credentials from ${type}:`, error)
          }
        }
      },

      rehydrateFromBrowserStorage: async () => {
        if (typeof window === 'undefined') return

        const hydrationRevision = ++aiConfigHydrationRevision
        const fieldRevisions = { ...credentialRevisions }
        const connectionRevision = customConnectionRevision
        const savedStorageTypeRevision = storageTypeRevision
        set({ credentialsHydrating: true })

        try {
          // Cloud-provider keys retain the explicit shared-workstation choice.
          // The durable custom endpoint is intentionally independent.
          const savedStorageType = window.localStorage.getItem(
            STORAGE_KEYS.STORAGE_TYPE,
          ) as StorageType | null
          let storageType: StorageType
          if (savedStorageType === 'localStorage' || savedStorageType === 'sessionStorage') {
            storageType = savedStorageType
          } else {
            const hasLegacyLocalKeys =
              window.localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) !== null ||
              window.localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) !== null ||
              window.localStorage.getItem(STORAGE_KEYS.PERPLEXITY_API_KEY) !== null ||
              window.localStorage.getItem(STORAGE_KEYS.CLAUDE_API_KEY) !== null
            storageType = hasLegacyLocalKeys ? 'localStorage' : 'sessionStorage'
            window.localStorage.setItem(STORAGE_KEYS.STORAGE_TYPE, storageType)
          }

          const deviceStorage = getStorage('localStorage')
          const connectionRaw = deviceStorage?.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
          ) ?? null
          const storedConnection = parseStoredOpenAiCompatibleConnection(connectionRaw)
          const localLegacyConfigRaw = window.localStorage.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG,
          )
          const localLegacyKeyRaw = window.localStorage.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY,
          )
          const sessionLegacyConfigRaw = window.sessionStorage.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG,
          )
          const sessionLegacyKeyRaw = window.sessionStorage.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY,
          )
          const legacyProfile = storedConnection
            ? null
            : loadLegacyOpenAiCompatibleProfile('localStorage') ??
              loadLegacyOpenAiCompatibleProfile('sessionStorage')
          const storedProfile = storedConnection?.profile ?? legacyProfile?.profile ?? null
          const customCredentialRaw = storedConnection?.encryptedApiKey ??
            legacyProfile?.credentialRaw ?? null

          const [apiKey, geminiKey, perplexityKey, claudeKey, customCredential] =
            await Promise.all([
              loadEncryptedKey(storageType, STORAGE_KEYS.OPENAI_API_KEY),
              loadEncryptedKey(storageType, STORAGE_KEYS.GEMINI_API_KEY),
              loadEncryptedKey(storageType, STORAGE_KEYS.PERPLEXITY_API_KEY),
              loadEncryptedKey(storageType, STORAGE_KEYS.CLAUDE_API_KEY),
              decodeStoredCredential(
                customCredentialRaw,
                STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY,
              ),
            ])

          if (hydrationRevision !== aiConfigHydrationRevision) return

          let hydratedOpenAiCompatible: OpenAiCompatibleConfig | undefined
          if (connectionRevision === customConnectionRevision) {
            let restoredCustomKey = customCredential.invalid ? null : customCredential.value
            let encryptedCustomKey = customCredential.invalid ? null : customCredentialRaw

            if (customCredential.needsEncryption && restoredCustomKey) {
              try {
                encryptedCustomKey = await encrypt(restoredCustomKey)
              } catch (error) {
                console.warn('Failed to encrypt legacy custom endpoint key:', error)
                // Do not retain or expose legacy plaintext if secure migration fails.
                encryptedCustomKey = null
                restoredCustomKey = null
              }
            }

            if (
              hydrationRevision === aiConfigHydrationRevision &&
              connectionRevision === customConnectionRevision
            ) {
              const connectionStillCurrent = storedConnection
                ? deviceStorage?.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION) ===
                  connectionRaw
                : legacyProfile
                  ? deviceStorage?.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION) ===
                    connectionRaw &&
                    getStorage(legacyProfile.storageType)?.getItem(
                      STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG,
                    ) === legacyProfile.raw &&
                    getStorage(legacyProfile.storageType)?.getItem(
                      STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY,
                    ) === legacyProfile.credentialRaw
                  : true

              if (storedProfile && connectionStillCurrent && deviceStorage) {
                try {
                  if (
                    legacyProfile ||
                    customCredential.invalid ||
                    customCredential.needsEncryption
                  ) {
                    deviceStorage.setItem(
                      STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
                      serializeOpenAiCompatibleConnection(
                        storedProfile,
                        encryptedCustomKey,
                      ),
                    )
                  }
                  clearLegacyOpenAiCompatibleStorage()
                  hydratedOpenAiCompatible = {
                    ...storedProfile,
                    apiKey: restoredCustomKey,
                  }
                } catch (error) {
                  console.warn('Failed to migrate custom endpoint to device storage:', error)
                  if (
                    storedConnection &&
                    (customCredential.needsEncryption || customCredential.invalid) &&
                    deviceStorage.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION) ===
                    connectionRaw
                  ) {
                    deviceStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION)
                    restoredCustomKey = null
                  } else if (customCredential.needsEncryption || customCredential.invalid) {
                    const legacyKeyStorage = legacyProfile
                      ? getStorage(legacyProfile.storageType)
                      : deviceStorage
                    if (
                      legacyKeyStorage?.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY) ===
                      customCredential.raw
                    ) {
                      legacyKeyStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY)
                    }
                    restoredCustomKey = null
                  }
                  hydratedOpenAiCompatible = { ...storedProfile, apiKey: restoredCustomKey }
                }
              } else if (!storedProfile) {
                // Remove corrupted profiles and orphan credentials only when
                // storage still contains the exact snapshot we inspected.
                if (connectionRaw && deviceStorage?.getItem(
                  STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
                ) === connectionRaw) {
                  deviceStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION)
                }
                const legacySnapshots = [
                  [window.localStorage, localLegacyConfigRaw, localLegacyKeyRaw],
                  [window.sessionStorage, sessionLegacyConfigRaw, sessionLegacyKeyRaw],
                ] as const
                for (const [storage, configRaw, keyRaw] of legacySnapshots) {
                  if (
                    configRaw &&
                    storage.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG) === configRaw
                  ) storage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG)
                  if (
                    keyRaw &&
                    storage.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY) === keyRaw
                  ) storage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY)
                }
                hydratedOpenAiCompatible = createEmptyOpenAiCompatibleConfig()
              }
            }
          }

          if (hydrationRevision !== aiConfigHydrationRevision) return

          const updates: Partial<AiConfigState> = {}
          if (fieldRevisions.apiKey === credentialRevisions.apiKey) {
            updates.apiKey = apiKey.value
          }
          if (fieldRevisions.geminiKey === credentialRevisions.geminiKey) {
            updates.geminiKey = geminiKey.value
          }
          if (fieldRevisions.perplexityKey === credentialRevisions.perplexityKey) {
            updates.perplexityKey = perplexityKey.value
          }
          if (fieldRevisions.claudeKey === credentialRevisions.claudeKey) {
            updates.claudeKey = claudeKey.value
          }
          if (savedStorageTypeRevision === storageTypeRevision) {
            updates.storageType = storageType
          }
          if (hydratedOpenAiCompatible) {
            updates.openAiCompatible = hydratedOpenAiCompatible
          }
          set(updates)

          await Promise.all([
            finishLoadedCredential(
              storageType,
              STORAGE_KEYS.OPENAI_API_KEY,
              apiKey,
              () => hydrationRevision === aiConfigHydrationRevision &&
                fieldRevisions.apiKey === credentialRevisions.apiKey,
            ),
            finishLoadedCredential(
              storageType,
              STORAGE_KEYS.GEMINI_API_KEY,
              geminiKey,
              () => hydrationRevision === aiConfigHydrationRevision &&
                fieldRevisions.geminiKey === credentialRevisions.geminiKey,
            ),
            finishLoadedCredential(
              storageType,
              STORAGE_KEYS.PERPLEXITY_API_KEY,
              perplexityKey,
              () => hydrationRevision === aiConfigHydrationRevision &&
                fieldRevisions.perplexityKey === credentialRevisions.perplexityKey,
            ),
            finishLoadedCredential(
              storageType,
              STORAGE_KEYS.CLAUDE_API_KEY,
              claudeKey,
              () => hydrationRevision === aiConfigHydrationRevision &&
                fieldRevisions.claudeKey === credentialRevisions.claudeKey,
            ),
          ])
        } finally {
          if (hydrationRevision === aiConfigHydrationRevision) {
            set({ credentialsHydrating: false })
          }
        }
      },
    }),
    {
      // Keep this lifecycle-only middleware separate from the legacy
      // `ai-config-storage` record. model-prefs still reads that old record once
      // to migrate the user's former global model selection.
      name: 'ai-config-hydration',
      // This middleware is used only for its hydration lifecycle hooks. All
      // actual credentials use the explicit encrypted storage paths above, so
      // a no-op backend avoids an empty localStorage write on every state
      // update (which could otherwise throw and interrupt logout cleanup).
      storage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      // Keys are NOT persisted through Zustand (they're encrypted into their
      // own storage entries by the actions above); nothing else needs to
      // persist since the model moved to model-prefs. The middleware stays for
      // onRehydrateStorage, which loads the encrypted keys + storage type.
      partialize: () => ({}),
      onRehydrateStorage: () => (state) => {
        // Zustand does not await an async completion callback. Delegate to a
        // store action that uses set(), so both the profile and later decrypted
        // credentials notify mounted subscribers correctly.
        void state?.rehydrateFromBrowserStorage().catch((error) => {
          console.warn('Failed to restore AI credentials from browser storage:', error)
        })
      },
    }
  )
)

// Selectors with stable references for SSR
const selectApiKey = (state: AiConfigState) => state.apiKey
const selectGeminiKey = (state: AiConfigState) => state.geminiKey
const selectPerplexityKey = (state: AiConfigState) => state.perplexityKey
const selectClaudeKey = (state: AiConfigState) => state.claudeKey
const selectOpenAiCompatible = (state: AiConfigState) => state.openAiCompatible

export const useApiKey = () => useAiConfigStore(selectApiKey)
export const useGeminiKey = () => useAiConfigStore(selectGeminiKey)
export const usePerplexityKey = () => useAiConfigStore(selectPerplexityKey)
export const useClaudeKey = () => useAiConfigStore(selectClaudeKey)
export const useOpenAiCompatibleConfig = () => useAiConfigStore(selectOpenAiCompatible)

// Use useShallow to prevent infinite loops from object reference changes
export const useAllApiKeys = () => useAiConfigStore(
  useShallow((state) => ({
    apiKey: state.apiKey,
    geminiKey: state.geminiKey,
    perplexityKey: state.perplexityKey,
    claudeKey: state.claudeKey,
    openAiCompatible: state.openAiCompatible,
  }))
)
