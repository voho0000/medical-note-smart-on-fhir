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
import type {
  OpenAiCompatibleConfig,
  OpenAiCompatibleProfile,
} from '@/src/shared/types/openai-compatible.types'
import {
  createEmptyOpenAiCompatibleConfig,
  LEGACY_OPENAI_COMPATIBLE_PROFILE_ID,
  MAX_OPENAI_COMPATIBLE_PROFILES,
  normalizeOpenAiCompatibleAgentCapability,
  normalizeOpenAiCompatibleAgentCapabilityTestedAt,
  normalizeOpenAiCompatibleAgentMode,
  normalizeOpenAiCompatibleContextWindow,
  normalizeOpenAiCompatibleContextWindowSource,
  normalizeOpenAiCompatibleTransport,
  suggestedOpenAiCompatibleContextWindow,
} from '@/src/shared/types/openai-compatible.types'
import { normalizeOpenAiCompatibleBaseUrl } from '@/src/shared/utils/openai-compatible.utils'
import { DEPLOYMENT_CONFIG } from '@/src/shared/config/deployment-profile.config'

type StorageType = 'localStorage' | 'sessionStorage'

export interface UpdateOpenAiCompatibleConfigOptions {
  /** Identity changes revoke previous Agent trust. Settings may preserve the
   * explicit standard-chat policy submitted in this update only after user
   * confirmation. There is no manual bypass for Agent capability verification. */
  confirmAgentModeForIdentityChange?: boolean
}

interface AiConfigState {
  // API Keys
  apiKey: string | null
  geminiKey: string | null
  perplexityKey: string | null
  claudeKey: string | null
  /** All durable custom connections. `openAiCompatible` below is retained as
   * the compatibility view used by consumers that have not adopted profile
   * selection yet. */
  openAiCompatibleProfiles: OpenAiCompatibleProfile[]
  openAiCompatible: OpenAiCompatibleConfig
  storageType: StorageType
  credentialsHydrating: boolean
  storageTypeChanging: boolean

  // Actions
  setApiKey: (key: string | null) => void
  setGeminiKey: (key: string | null) => void
  setPerplexityKey: (key: string | null) => void
  setClaudeKey: (key: string | null) => void
  addOpenAiCompatibleConfig: (config: OpenAiCompatibleConfig) => Promise<string>
  updateOpenAiCompatibleConfig: (
    profileId: string,
    config: OpenAiCompatibleConfig,
    options?: UpdateOpenAiCompatibleConfigOptions,
  ) => Promise<void>
  setOpenAiCompatibleProfileEnabled: (profileId: string, enabled: boolean) => Promise<void>
  deleteOpenAiCompatibleConfig: (profileId: string) => void
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
  OPENAI_COMPATIBLE_CONNECTIONS: 'openai_compatible_connections_v2',
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

const CLOUD_CREDENTIAL_STORAGE_KEYS = [
  STORAGE_KEYS.OPENAI_API_KEY,
  STORAGE_KEYS.GEMINI_API_KEY,
  STORAGE_KEYS.PERPLEXITY_API_KEY,
  STORAGE_KEYS.CLAUDE_API_KEY,
] as const

/** Remove credentials that could enable public AI in an on-prem artifact. */
const clearStoredCloudCredentials = () => {
  if (typeof window === 'undefined' || DEPLOYMENT_CONFIG.allowsCloudAi) return
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of CLOUD_CREDENTIAL_STORAGE_KEYS) storage.removeItem(key)
  }
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
  | 'agentMode'
  | 'agentCapability'
  | 'agentCapabilityTestedAt'
>

interface StoredOpenAiCompatibleConnectionV1 {
  version: 1
  profile: StoredOpenAiCompatibleConfig
  encryptedApiKey: string | null
}

interface StoredOpenAiCompatibleProfileV2 {
  profileId: string
  profile: StoredOpenAiCompatibleConfig
  encryptedApiKey: string | null
}

interface StoredOpenAiCompatibleConnectionsV2 {
  version: 2
  profiles: StoredOpenAiCompatibleProfileV2[]
}

const resetOpenAiCompatibleAgentTrust = <T extends object>(value: T) => ({
  ...value,
  agentMode: 'auto' as const,
  agentCapability: 'unknown' as const,
  agentCapabilityTestedAt: null,
})

const LEGACY_SUGGESTED_CONTEXT_WINDOW = 15000

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
    const contextWindowSource = normalizeOpenAiCompatibleContextWindowSource(
      parsed.contextWindowSource,
      true,
    )
    const normalizedContextWindow = normalizeOpenAiCompatibleContextWindow(
      parsed.contextWindowTokens,
      modelId,
    )
    const agentCapabilityTestedAt = normalizeOpenAiCompatibleAgentCapabilityTestedAt(
      parsed.agentCapabilityTestedAt,
    )
    return {
      enabled: parsed.enabled === true,
      baseUrl,
      modelId,
      transport: normalizeOpenAiCompatibleTransport(parsed.transport),
      // Upgrade only the old automatic fallback. Values that were detected
      // from an endpoint or entered manually remain untouched.
      contextWindowTokens: contextWindowSource === 'suggested' &&
        normalizedContextWindow === LEGACY_SUGGESTED_CONTEXT_WINDOW
        ? suggestedOpenAiCompatibleContextWindow(modelId)
        : normalizedContextWindow,
      contextWindowSource,
      agentMode: normalizeOpenAiCompatibleAgentMode(parsed.agentMode),
      agentCapability: agentCapabilityTestedAt === null
        ? 'unknown'
        : normalizeOpenAiCompatibleAgentCapability(parsed.agentCapability),
      agentCapabilityTestedAt,
    }
  } catch {
    return null
  }
}

const toStoredOpenAiCompatibleConfig = (
  config: OpenAiCompatibleConfig,
): StoredOpenAiCompatibleConfig => {
  const agentCapabilityTestedAt = normalizeOpenAiCompatibleAgentCapabilityTestedAt(
    config.agentCapabilityTestedAt,
  )
  return {
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
    agentMode: normalizeOpenAiCompatibleAgentMode(config.agentMode),
    agentCapability: agentCapabilityTestedAt === null
      ? 'unknown'
      : normalizeOpenAiCompatibleAgentCapability(config.agentCapability),
    agentCapabilityTestedAt,
  }
}

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
): StoredOpenAiCompatibleConnectionV1 | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredOpenAiCompatibleConnectionV1>
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

const normalizeOpenAiCompatibleProfileId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const profileId = value.trim()
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(profileId) ? profileId : null
}

const parseStoredOpenAiCompatibleConnections = (
  raw: string | null,
): StoredOpenAiCompatibleConnectionsV2 | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredOpenAiCompatibleConnectionsV2>
    if (parsed.version !== 2 || !Array.isArray(parsed.profiles)) return null

    const seen = new Set<string>()
    const profiles: StoredOpenAiCompatibleProfileV2[] = []
    // Bound validation and subsequent PBKDF2 work even if browser storage was
    // tampered with. Invalid and duplicate rows fail closed individually.
    for (const value of parsed.profiles) {
      if (profiles.length >= MAX_OPENAI_COMPATIBLE_PROFILES) break
      if (!value || typeof value !== 'object') continue
      const candidate = value as Partial<StoredOpenAiCompatibleProfileV2>
      const profileId = normalizeOpenAiCompatibleProfileId(candidate.profileId)
      const profile = normalizeStoredOpenAiCompatibleConfig(candidate.profile)
      if (
        !profileId ||
        seen.has(profileId) ||
        !profile ||
        !(candidate.encryptedApiKey === null || typeof candidate.encryptedApiKey === 'string')
      ) continue
      seen.add(profileId)
      profiles.push({
        profileId,
        profile,
        encryptedApiKey: candidate.encryptedApiKey,
      })
    }
    return { version: 2, profiles }
  } catch {
    return null
  }
}

const serializeOpenAiCompatibleConnections = (
  profiles: StoredOpenAiCompatibleProfileV2[],
) => JSON.stringify({ version: 2, profiles })

const clearLegacyOpenAiCompatibleStorage = () => {
  getStorage('localStorage')?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION)
  for (const storageType of ['localStorage', 'sessionStorage'] as const) {
    const storage = getStorage(storageType)
    storage?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG)
    storage?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY)
  }
}

/** Every endpoint profile and its ciphertext share one versioned localStorage
 * envelope. `setItem` publishes the complete list atomically, avoiding both a
 * profile/key mismatch and partial multi-profile updates. */
const persistOpenAiCompatibleProfilesOnDevice = async (
  profiles: OpenAiCompatibleProfile[],
  expectedRevision: number,
) => {
  const storage = getStorage('localStorage')
  if (!storage) return

  const storedProfiles = await Promise.all(profiles.map(async (profile) => ({
    profileId: profile.profileId,
    profile: toStoredOpenAiCompatibleConfig(profile),
    encryptedApiKey: profile.apiKey ? await encrypt(profile.apiKey) : null,
  })))
  if (expectedRevision !== customConnectionRevision) throw createStaleOperationError()

  if (storedProfiles.length === 0) {
    storage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS)
  } else {
    storage.setItem(
      STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
      serializeOpenAiCompatibleConnections(storedProfiles),
    )
  }
  // The caller checks the same revision again before publishing state. A
  // clear/logout during either async boundary therefore cannot be undone.
  clearLegacyOpenAiCompatibleStorage()
}

const normalizeOpenAiCompatibleConfig = (
  config: OpenAiCompatibleConfig,
  previous?: OpenAiCompatibleConfig,
): OpenAiCompatibleConfig => {
  const agentMode = normalizeOpenAiCompatibleAgentMode(
    config.agentMode !== undefined ? config.agentMode : previous?.agentMode,
  )
  const agentCapabilityTestedAt = normalizeOpenAiCompatibleAgentCapabilityTestedAt(
    config.agentCapabilityTestedAt !== undefined
      ? config.agentCapabilityTestedAt
      : previous?.agentCapabilityTestedAt,
  )
  const agentCapability = agentCapabilityTestedAt === null
    ? 'unknown'
    : normalizeOpenAiCompatibleAgentCapability(
      config.agentCapability !== undefined
        ? config.agentCapability
        : previous?.agentCapability,
    )

  return {
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
    agentMode,
    agentCapability,
    agentCapabilityTestedAt,
  }
}

const connectionIdentityChanged = (
  previous: OpenAiCompatibleConfig,
  next: OpenAiCompatibleConfig,
) => (
  previous.baseUrl !== next.baseUrl ||
  previous.modelId !== next.modelId ||
  normalizeOpenAiCompatibleTransport(previous.transport) !== next.transport ||
  sanitizeApiKey(previous.apiKey) !== next.apiKey
)

const toOpenAiCompatibleProfile = (
  profileId: string,
  config: OpenAiCompatibleConfig,
  previous?: OpenAiCompatibleProfile,
  options?: UpdateOpenAiCompatibleConfigOptions,
): OpenAiCompatibleProfile => {
  const normalized = normalizeOpenAiCompatibleConfig(config, previous)
  if (previous && connectionIdentityChanged(previous, normalized)) {
    const submittedMode = normalizeOpenAiCompatibleAgentMode(config.agentMode)
    normalized.agentMode = options?.confirmAgentModeForIdentityChange === true &&
      submittedMode !== 'auto'
      ? submittedMode
      : 'auto'
    const previousTestedAt = normalizeOpenAiCompatibleAgentCapabilityTestedAt(
      previous.agentCapabilityTestedAt,
    )
    const incomingTestedAt = normalizeOpenAiCompatibleAgentCapabilityTestedAt(
      config.agentCapabilityTestedAt,
    )
    const hasNewCapabilityResult = incomingTestedAt !== null &&
      incomingTestedAt !== previousTestedAt
    if (!hasNewCapabilityResult) {
      normalized.agentCapability = 'unknown'
      normalized.agentCapabilityTestedAt = null
    }
  }
  return { profileId, ...normalized }
}

const compatibilityOpenAiCompatibleConfig = (
  profiles: OpenAiCompatibleProfile[],
): OpenAiCompatibleConfig => {
  const selected = profiles.find(
    (profile) => profile.profileId === LEGACY_OPENAI_COMPATIBLE_PROFILE_ID,
  ) ?? profiles[0]
  if (!selected) return createEmptyOpenAiCompatibleConfig()
  const { profileId: _profileId, ...config } = selected
  return config
}

const createOpenAiCompatibleProfileId = (existing: OpenAiCompatibleProfile[]): string => {
  const used = new Set(existing.map((profile) => profile.profileId))
  let profileId = ''
  do {
    profileId = globalThis.crypto?.randomUUID?.() ??
      `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  } while (used.has(profileId))
  return profileId
}

/** Deletion does not need to decrypt or re-encrypt surviving credentials. Copy
 * their already encrypted rows into a new atomic envelope so the action stays
 * synchronous (matching the legacy clear action) without exposing plaintext. */
const persistOpenAiCompatibleProfileDeletion = (
  remainingProfiles: OpenAiCompatibleProfile[],
  expectedRevision: number,
) => {
  const storage = getStorage('localStorage')
  if (!storage || expectedRevision !== customConnectionRevision) return
  const stored = parseStoredOpenAiCompatibleConnections(
    storage.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS),
  )
  const remainingIds = new Set(remainingProfiles.map((profile) => profile.profileId))
  const storedProfiles = stored?.profiles.filter((profile) => (
    remainingIds.has(profile.profileId)
  )) ?? []

  if (storedProfiles.length === 0) {
    storage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS)
  } else {
    storage.setItem(
      STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
      serializeOpenAiCompatibleConnections(storedProfiles),
    )
  }
  clearLegacyOpenAiCompatibleStorage()
}

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
      openAiCompatibleProfiles: [],
      openAiCompatible: createEmptyOpenAiCompatibleConfig(),
      storageType: 'sessionStorage',
      credentialsHydrating: false,
      storageTypeChanging: false,

      // Actions. Removing a key needs no model bookkeeping here — every model
      // pref is key-gated at read time (useEffectiveModel / resolvedModelId),
      // so stranded premium picks land on the feature's free default.
      setApiKey: (key) => {
        if (!DEPLOYMENT_CONFIG.allowsCloudAi) {
          bumpCredentialRevision('apiKey')
          set({ apiKey: null })
          clearStoredCloudCredentials()
          return
        }
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
        if (!DEPLOYMENT_CONFIG.allowsCloudAi) {
          bumpCredentialRevision('geminiKey')
          set({ geminiKey: null })
          clearStoredCloudCredentials()
          return
        }
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
        if (!DEPLOYMENT_CONFIG.allowsCloudAi) {
          bumpCredentialRevision('perplexityKey')
          set({ perplexityKey: null })
          clearStoredCloudCredentials()
          return
        }
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
        if (!DEPLOYMENT_CONFIG.allowsCloudAi) {
          bumpCredentialRevision('claudeKey')
          set({ claudeKey: null })
          clearStoredCloudCredentials()
          return
        }
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

      addOpenAiCompatibleConfig: async (config) => {
        const current = get().openAiCompatibleProfiles
        if (current.length >= MAX_OPENAI_COMPATIBLE_PROFILES) {
          throw new Error(`At most ${MAX_OPENAI_COMPATIBLE_PROFILES} custom endpoints can be saved`)
        }
        const profileId = createOpenAiCompatibleProfileId(current)
        const next = [...current, toOpenAiCompatibleProfile(profileId, config)]
        const revision = ++customConnectionRevision
        await persistOpenAiCompatibleProfilesOnDevice(next, revision)
        if (revision !== customConnectionRevision) throw createStaleOperationError()
        set({
          openAiCompatibleProfiles: next,
          openAiCompatible: compatibilityOpenAiCompatibleConfig(next),
        })
        return profileId
      },

      updateOpenAiCompatibleConfig: async (profileId, config, options) => {
        const current = get().openAiCompatibleProfiles
        if (!current.some((profile) => profile.profileId === profileId)) {
          throw new Error('OpenAI-compatible profile was not found')
        }
        const next = current.map((profile) => (
          profile.profileId === profileId
            ? toOpenAiCompatibleProfile(profileId, config, profile, options)
            : profile
        ))
        const revision = ++customConnectionRevision
        await persistOpenAiCompatibleProfilesOnDevice(next, revision)
        if (revision !== customConnectionRevision) throw createStaleOperationError()
        set({
          openAiCompatibleProfiles: next,
          openAiCompatible: compatibilityOpenAiCompatibleConfig(next),
        })
      },

      setOpenAiCompatibleProfileEnabled: async (profileId, enabled) => {
        const current = get().openAiCompatibleProfiles
        if (!current.some((profile) => profile.profileId === profileId)) {
          throw new Error('OpenAI-compatible profile was not found')
        }
        const next = current.map((profile) => (
          profile.profileId === profileId ? { ...profile, enabled } : profile
        ))
        const revision = ++customConnectionRevision
        await persistOpenAiCompatibleProfilesOnDevice(next, revision)
        if (revision !== customConnectionRevision) throw createStaleOperationError()
        set({
          openAiCompatibleProfiles: next,
          openAiCompatible: compatibilityOpenAiCompatibleConfig(next),
        })
      },

      deleteOpenAiCompatibleConfig: (profileId) => {
        const current = get().openAiCompatibleProfiles
        if (!current.some((profile) => profile.profileId === profileId)) return
        const revision = ++customConnectionRevision
        const next = current.filter((profile) => profile.profileId !== profileId)
        persistOpenAiCompatibleProfileDeletion(next, revision)
        set({
          openAiCompatibleProfiles: next,
          openAiCompatible: compatibilityOpenAiCompatibleConfig(next),
        })
      },

      setOpenAiCompatibleConfig: async (config) => {
        const current = get().openAiCompatibleProfiles
        const target = current.find(
          (profile) => profile.profileId === LEGACY_OPENAI_COMPATIBLE_PROFILE_ID,
        ) ?? current[0]
        const profileId = target?.profileId ?? LEGACY_OPENAI_COMPATIBLE_PROFILE_ID
        const nextProfile = toOpenAiCompatibleProfile(profileId, config, target)
        const next = target
          ? current.map((profile) => profile.profileId === profileId ? nextProfile : profile)
          : [nextProfile]
        const revision = ++customConnectionRevision
        await persistOpenAiCompatibleProfilesOnDevice(next, revision)
        if (revision !== customConnectionRevision) throw createStaleOperationError()
        set({
          openAiCompatibleProfiles: next,
          openAiCompatible: compatibilityOpenAiCompatibleConfig(next),
        })
      },

      setOpenAiCompatibleEnabled: async (enabled) => {
        const current = get().openAiCompatibleProfiles
        const target = current.find(
          (profile) => profile.profileId === LEGACY_OPENAI_COMPATIBLE_PROFILE_ID,
        ) ?? current[0]
        if (!target) return
        await get().setOpenAiCompatibleProfileEnabled(target.profileId, enabled)
      },

      clearOpenAiCompatibleConfig: () => {
        const current = get().openAiCompatibleProfiles
        const target = current.find(
          (profile) => profile.profileId === LEGACY_OPENAI_COMPATIBLE_PROFILE_ID,
        ) ?? current[0]
        if (!target) {
          customConnectionRevision += 1
          getStorage('localStorage')?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS)
          clearLegacyOpenAiCompatibleStorage()
          set({
            openAiCompatibleProfiles: [],
            openAiCompatible: createEmptyOpenAiCompatibleConfig(),
          })
          return
        }
        get().deleteOpenAiCompatibleConfig(target.profileId)
      },
      
      setStorageType: async (type) => {
        // Stored cloud keys have not reached memory yet; migrating from null
        // values here would erase them. The Settings UI is disabled as well,
        // but keep the action safe for programmatic callers.
        const currentState = get()
        if (!DEPLOYMENT_CONFIG.allowsCloudAi) {
          clearStoredCloudCredentials()
          bumpAllCredentialRevisions()
          storageTypeRevision += 1
          set({
            apiKey: null,
            geminiKey: null,
            perplexityKey: null,
            claudeKey: null,
            storageType: type,
          })
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEYS.STORAGE_TYPE, type)
          }
          return
        }
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
        const capabilityInvalidatedProfileIds = new Set(
          get().openAiCompatibleProfiles
            .filter((profile) => Boolean(profile.apiKey))
            .map((profile) => profile.profileId),
        )
        // Logout/key clearing can race credential hydration. Include profiles
        // whose encrypted key is still only on disk so their Agent trust cannot
        // survive merely because the in-memory key has not decrypted yet.
        try {
          const storedConnections = parseStoredOpenAiCompatibleConnections(
            getStorage('localStorage')?.getItem(
              STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
            ) ?? null,
          )
          for (const entry of storedConnections?.profiles ?? []) {
            if (entry.encryptedApiKey) {
              capabilityInvalidatedProfileIds.add(entry.profileId)
            }
          }
          for (const type of ['localStorage', 'sessionStorage'] as const) {
            if (getStorage(type)?.getItem(
              STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY,
            ) !== null) {
              capabilityInvalidatedProfileIds.add(
                LEGACY_OPENAI_COMPATIBLE_PROFILE_ID,
              )
            }
          }
        } catch {
          // Storage cleanup below remains best-effort; memory keys are still
          // cleared synchronously even when browser storage cannot be read.
        }

        // Memory is cleared first so StorageError cannot leave usable keys in
        // the running app or interrupt an auth/logout cleanup chain.
        set((state) => {
          const openAiCompatibleProfiles = state.openAiCompatibleProfiles.map((profile) => ({
            ...profile,
            apiKey: null,
            ...(capabilityInvalidatedProfileIds.has(profile.profileId)
              ? {
                  agentMode: 'auto' as const,
                  agentCapability: 'unknown' as const,
                  agentCapabilityTestedAt: null,
                }
              : {}),
          }))
          return {
            apiKey: null,
            geminiKey: null,
            perplexityKey: null,
            claudeKey: null,
            openAiCompatibleProfiles,
            openAiCompatible: compatibilityOpenAiCompatibleConfig(openAiCompatibleProfiles),
            storageTypeChanging: false,
          }
        })

        // Preserve the custom endpoint itself while removing its credential
        // from the same atomic record. If rewriting fails, remove the record so
        // a logout can never leave a recoverable key behind.
        let deviceStorage: Storage | null = null
        try {
          deviceStorage = getStorage('localStorage')
          const storedConnectionsRaw = deviceStorage?.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
          ) ?? null
          const storedConnections = parseStoredOpenAiCompatibleConnections(
            storedConnectionsRaw,
          )
          if (deviceStorage && storedConnectionsRaw) {
            if (storedConnections) {
              deviceStorage.setItem(
                STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
                serializeOpenAiCompatibleConnections(storedConnections.profiles.map((entry) => ({
                  ...entry,
                  profile: capabilityInvalidatedProfileIds.has(entry.profileId) ||
                    Boolean(entry.encryptedApiKey)
                    ? {
                        ...entry.profile,
                        agentMode: 'auto',
                        agentCapability: 'unknown',
                        agentCapabilityTestedAt: null,
                      }
                    : entry.profile,
                  encryptedApiKey: null,
                }))),
              )
            } else {
              deviceStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS)
            }
          }
          const storedConnectionRaw = deviceStorage?.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
          ) ?? null
          const storedConnection = parseStoredOpenAiCompatibleConnection(storedConnectionRaw)
          if (deviceStorage && storedConnectionRaw) {
            if (storedConnection) {
              const profile = storedConnection.encryptedApiKey
                ? resetOpenAiCompatibleAgentTrust(storedConnection.profile)
                : storedConnection.profile
              deviceStorage.setItem(
                STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
                serializeOpenAiCompatibleConnection(profile, null),
              )
            } else {
              deviceStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION)
            }
          }
        } catch (error) {
          try {
            deviceStorage?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS)
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

            // Before v1, the endpoint profile and its key lived in separate
            // records. Clearing only that key would leave a trusted
            // `deep-agent / verified` profile behind, allowing the trust result
            // to reappear on the next page load. Revoke the trust in-place
            // before removing the key; if the safe rewrite fails, remove the
            // stale profile rather than retain an unverifiable capability.
            const legacyKeyRaw = storage?.getItem(
              STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY,
            ) ?? null
            if (storage && legacyKeyRaw !== null) {
              const legacyConfigRaw = storage.getItem(
                STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG,
              )
              if (legacyConfigRaw !== null) {
                try {
                  const legacyConfig = normalizeStoredOpenAiCompatibleConfig(
                    JSON.parse(legacyConfigRaw),
                  )
                  if (!legacyConfig) throw new Error('Invalid legacy endpoint profile')
                  storage.setItem(
                    STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG,
                    JSON.stringify(resetOpenAiCompatibleAgentTrust(legacyConfig)),
                  )
                } catch (error) {
                  storage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG)
                  console.warn(
                    `Failed to revoke legacy custom endpoint trust in ${type}:`,
                    error,
                  )
                }
              }
            }
            storage?.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY)
          } catch (error) {
            console.warn(`Failed to clear credentials from ${type}:`, error)
          }
        }
      },

      rehydrateFromBrowserStorage: async () => {
        if (typeof window === 'undefined') return

        clearStoredCloudCredentials()

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
          const connectionsRaw = deviceStorage?.getItem(
            STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
          ) ?? null
          const storedConnections = parseStoredOpenAiCompatibleConnections(connectionsRaw)
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
          const legacyProfile = storedConnections || storedConnection
            ? null
            : loadLegacyOpenAiCompatibleProfile('localStorage') ??
              loadLegacyOpenAiCompatibleProfile('sessionStorage')
          const sourceProfiles: StoredOpenAiCompatibleProfileV2[] = storedConnections?.profiles ?? (
            storedConnection
              ? [{
                  profileId: LEGACY_OPENAI_COMPATIBLE_PROFILE_ID,
                  profile: storedConnection.profile,
                  encryptedApiKey: storedConnection.encryptedApiKey,
                }]
              : legacyProfile
                ? [{
                    profileId: LEGACY_OPENAI_COMPATIBLE_PROFILE_ID,
                    profile: legacyProfile.profile,
                    encryptedApiKey: legacyProfile.credentialRaw,
                  }]
                : []
          )

          const [cloudCredentials, customCredentials] = await Promise.all([
            Promise.all([
              loadEncryptedKey(storageType, STORAGE_KEYS.OPENAI_API_KEY),
              loadEncryptedKey(storageType, STORAGE_KEYS.GEMINI_API_KEY),
              loadEncryptedKey(storageType, STORAGE_KEYS.PERPLEXITY_API_KEY),
              loadEncryptedKey(storageType, STORAGE_KEYS.CLAUDE_API_KEY),
            ]),
            Promise.all(sourceProfiles.map((entry) => decodeStoredCredential(
              entry.encryptedApiKey,
              `${STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY}:${entry.profileId}`,
            ))),
          ])
          const [apiKey, geminiKey, perplexityKey, claudeKey] = cloudCredentials

          if (hydrationRevision !== aiConfigHydrationRevision) return

          let hydratedOpenAiCompatibleProfiles: OpenAiCompatibleProfile[] | undefined
          if (connectionRevision === customConnectionRevision) {
            const restoredProfiles: OpenAiCompatibleProfile[] = []
            const migratedStoredProfiles: StoredOpenAiCompatibleProfileV2[] = []
            let unsafeCredentialMigrationFailed = false

            for (let index = 0; index < sourceProfiles.length; index += 1) {
              const source = sourceProfiles[index]
              const credential = customCredentials[index]
              let restoredKey = credential.invalid ? null : credential.value
              let encryptedKey = credential.invalid ? null : source.encryptedApiKey
              let credentialWasCleared = Boolean(source.encryptedApiKey) && credential.invalid

              if (credential.needsEncryption && restoredKey) {
                try {
                  encryptedKey = await encrypt(restoredKey)
                } catch (error) {
                  console.warn('Failed to encrypt legacy custom endpoint key:', error)
                  // Never retain or expose a legacy plaintext credential when
                  // secure destination-first migration cannot finish.
                  encryptedKey = null
                  restoredKey = null
                  credentialWasCleared = true
                  unsafeCredentialMigrationFailed = true
                }
              }

              const restoredProfile = credentialWasCleared
                ? resetOpenAiCompatibleAgentTrust(source.profile)
                : source.profile

              restoredProfiles.push({
                profileId: source.profileId,
                ...restoredProfile,
                apiKey: restoredKey,
              })
              migratedStoredProfiles.push({
                ...source,
                profile: restoredProfile,
                encryptedApiKey: encryptedKey,
              })
            }

            if (
              hydrationRevision === aiConfigHydrationRevision &&
              connectionRevision === customConnectionRevision
            ) {
              const connectionStillCurrent = (
                deviceStorage?.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS) ===
                  connectionsRaw &&
                deviceStorage?.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION) ===
                  connectionRaw &&
                (legacyProfile
                  ? (
                    getStorage(legacyProfile.storageType)?.getItem(
                      STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG,
                    ) === legacyProfile.raw &&
                    getStorage(legacyProfile.storageType)?.getItem(
                      STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY,
                    ) === legacyProfile.credentialRaw
                  )
                  : true)
              )

              if (sourceProfiles.length > 0 && connectionStillCurrent && deviceStorage) {
                try {
                  // Always publish the bounded, normalized v2 envelope. The
                  // write happens before any source deletion (destination-first).
                  deviceStorage.setItem(
                    STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
                    serializeOpenAiCompatibleConnections(migratedStoredProfiles),
                  )
                  clearLegacyOpenAiCompatibleStorage()
                  hydratedOpenAiCompatibleProfiles = restoredProfiles
                } catch (error) {
                  console.warn('Failed to migrate custom endpoints to device storage:', error)
                  if (unsafeCredentialMigrationFailed || customCredentials.some(
                    (credential) => credential.invalid || credential.needsEncryption,
                  )) {
                    // The migration write failed after unsafe/legacy credentials
                    // were encountered. Fall back to a keyless v2 envelope and
                    // revoke Agent trust for every profile whose restored key is
                    // now being discarded. If even this safe write is impossible,
                    // remove the exact source snapshot rather than retain a key.
                    const safeProfiles = restoredProfiles.map((profile) => (
                      profile.apiKey
                        ? { ...resetOpenAiCompatibleAgentTrust(profile), apiKey: null }
                        : { ...profile, apiKey: null }
                    ))
                    const safeStoredProfiles = migratedStoredProfiles.map((entry, index) => ({
                      ...entry,
                      profile: restoredProfiles[index]?.apiKey
                        ? resetOpenAiCompatibleAgentTrust(entry.profile)
                        : entry.profile,
                      encryptedApiKey: null,
                    }))
                    let safeStatePersisted = false
                    try {
                      deviceStorage.setItem(
                        STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
                        serializeOpenAiCompatibleConnections(safeStoredProfiles),
                      )
                      clearLegacyOpenAiCompatibleStorage()
                      safeStatePersisted = true
                    } catch (safeWriteError) {
                      console.warn(
                        'Failed to persist keyless custom endpoint fallback:',
                        safeWriteError,
                      )
                    }
                    if (!safeStatePersisted) {
                      if (storedConnections && deviceStorage.getItem(
                        STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
                      ) === connectionsRaw) {
                        deviceStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS)
                      }
                      if (storedConnection && deviceStorage.getItem(
                        STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION,
                      ) === connectionRaw) {
                        deviceStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTION)
                      }
                      if (legacyProfile) {
                        const legacyStorage = getStorage(legacyProfile.storageType)
                        if (legacyStorage?.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY) ===
                          legacyProfile.credentialRaw) {
                          legacyStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_API_KEY)
                        }
                        if (legacyStorage?.getItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG) ===
                          legacyProfile.raw) {
                          legacyStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONFIG)
                        }
                      }
                    }
                    hydratedOpenAiCompatibleProfiles = safeProfiles
                  } else {
                    hydratedOpenAiCompatibleProfiles = restoredProfiles
                  }
                }
              } else if (sourceProfiles.length === 0) {
                // Remove corrupted profiles and orphan credentials only when
                // storage still contains the exact snapshot we inspected.
                if (connectionsRaw && deviceStorage?.getItem(
                  STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS,
                ) === connectionsRaw) {
                  deviceStorage.removeItem(STORAGE_KEYS.OPENAI_COMPATIBLE_CONNECTIONS)
                }
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
                hydratedOpenAiCompatibleProfiles = []
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
          if (hydratedOpenAiCompatibleProfiles) {
            updates.openAiCompatibleProfiles = hydratedOpenAiCompatibleProfiles
            updates.openAiCompatible = compatibilityOpenAiCompatibleConfig(
              hydratedOpenAiCompatibleProfiles,
            )
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
const selectOpenAiCompatibleProfiles = (state: AiConfigState) => state.openAiCompatibleProfiles

export const useApiKey = () => useAiConfigStore(selectApiKey)
export const useGeminiKey = () => useAiConfigStore(selectGeminiKey)
export const usePerplexityKey = () => useAiConfigStore(selectPerplexityKey)
export const useClaudeKey = () => useAiConfigStore(selectClaudeKey)
export const useOpenAiCompatibleConfig = () => useAiConfigStore(selectOpenAiCompatible)
export const useOpenAiCompatibleProfiles = () => useAiConfigStore(selectOpenAiCompatibleProfiles)

// Use useShallow to prevent infinite loops from object reference changes
export const useAllApiKeys = () => useAiConfigStore(
  useShallow((state) => ({
    apiKey: state.apiKey,
    geminiKey: state.geminiKey,
    perplexityKey: state.perplexityKey,
    claudeKey: state.claudeKey,
    openAiCompatible: state.openAiCompatible,
    openAiCompatibleProfiles: state.openAiCompatibleProfiles,
  }))
)
