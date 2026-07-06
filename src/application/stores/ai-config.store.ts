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
import { encrypt, decrypt } from '@/src/shared/utils/crypto.utils'
import { isUsableApiKey, sanitizeApiKey } from '@/src/shared/utils/api-key.utils'

type StorageType = 'localStorage' | 'sessionStorage'

interface AiConfigState {
  // API Keys
  apiKey: string | null
  geminiKey: string | null
  perplexityKey: string | null
  claudeKey: string | null
  storageType: StorageType

  // Actions
  setApiKey: (key: string | null) => void
  setGeminiKey: (key: string | null) => void
  setPerplexityKey: (key: string | null) => void
  setClaudeKey: (key: string | null) => void
  setStorageType: (type: StorageType) => void
  clearAllKeys: () => void
}

const STORAGE_KEYS = {
  OPENAI_API_KEY: 'openai_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  PERPLEXITY_API_KEY: 'perplexity_api_key',
  CLAUDE_API_KEY: 'claude_api_key',
  STORAGE_TYPE: 'api_key_storage_type',
}

// Helper to get storage
const getStorage = (type: StorageType) => {
  if (typeof window === 'undefined') return null
  return type === 'localStorage' ? window.localStorage : window.sessionStorage
}

// Helper to load encrypted key (async)
const loadEncryptedKey = async (storageType: StorageType, key: string): Promise<string | null> => {
  const storage = getStorage(storageType)
  if (!storage) return null
  
  const encrypted = storage.getItem(key)
  if (!encrypted) return null

  try {
    const decrypted = await decrypt(encrypted)
    // A stored key with non-Latin1 chars (e.g. a chat message pasted into the
    // key field) would crash the provider's Headers construction. Ignore + clear
    // it so the app falls back to the proxy instead of an opaque error.
    if (!isUsableApiKey(decrypted)) {
      storage.removeItem(key)
      return null
    }
    return decrypted
  } catch (error) {
    console.warn(`Failed to decrypt ${key}:`, error)
    return null
  }
}

// Helper to save encrypted key (async)
const saveEncryptedKey = async (storageType: StorageType, key: string, value: string | null) => {
  const storage = getStorage(storageType)
  if (!storage) return
  
  if (value === null) {
    storage.removeItem(key)
  } else {
    try {
      const encrypted = await encrypt(value)
      storage.setItem(key, encrypted)
    } catch (error) {
      console.warn(`Failed to encrypt ${key}:`, error)
    }
  }
}

export const useAiConfigStore = create<AiConfigState>()(
  persist(
    (set, get) => ({
      // Initial state — sessionStorage by default (shared-workstation safety):
      // keys clear when the window closes. Users who want persistence flip the
      // "remember on this device" toggle in Settings, which switches storage to
      // localStorage and migrates any saved keys. onRehydrateStorage keeps
      // legacy users who already hold keys in localStorage on localStorage.
      apiKey: null,
      geminiKey: null,
      perplexityKey: null,
      claudeKey: null,
      storageType: 'sessionStorage',

      // Actions. Removing a key needs no model bookkeeping here — every model
      // pref is key-gated at read time (useEffectiveModel / resolvedModelId),
      // so stranded premium picks land on the feature's free default.
      setApiKey: (key) => {
        const clean = sanitizeApiKey(key)
        set({ apiKey: clean })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.OPENAI_API_KEY, clean).catch(console.error)
      },

      setGeminiKey: (key) => {
        const clean = sanitizeApiKey(key)
        set({ geminiKey: clean })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.GEMINI_API_KEY, clean).catch(console.error)
      },

      setPerplexityKey: (key) => {
        const clean = sanitizeApiKey(key)
        set({ perplexityKey: clean })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.PERPLEXITY_API_KEY, clean).catch(console.error)
      },

      setClaudeKey: (key) => {
        const clean = sanitizeApiKey(key)
        set({ claudeKey: clean })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.CLAUDE_API_KEY, clean).catch(console.error)
      },
      
      setStorageType: (type) => {
        const oldType = get().storageType
        set({ storageType: type })
        
        // Migrate keys to new storage (async)
        if (typeof window !== 'undefined') {
          const { apiKey, geminiKey, perplexityKey, claudeKey } = get()
          
          // Clear old storage
          const oldStorage = getStorage(oldType)
          oldStorage?.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
          oldStorage?.removeItem(STORAGE_KEYS.GEMINI_API_KEY)
          oldStorage?.removeItem(STORAGE_KEYS.PERPLEXITY_API_KEY)
          oldStorage?.removeItem(STORAGE_KEYS.CLAUDE_API_KEY)
          
          // Save to new storage (fire and forget)
          Promise.all([
            saveEncryptedKey(type, STORAGE_KEYS.OPENAI_API_KEY, apiKey),
            saveEncryptedKey(type, STORAGE_KEYS.GEMINI_API_KEY, geminiKey),
            saveEncryptedKey(type, STORAGE_KEYS.PERPLEXITY_API_KEY, perplexityKey),
            saveEncryptedKey(type, STORAGE_KEYS.CLAUDE_API_KEY, claudeKey),
          ]).catch(console.error)
          
          // Save storage type preference
          window.localStorage.setItem(STORAGE_KEYS.STORAGE_TYPE, type)
        }
      },
      
      clearAllKeys: () => {
        const storageType = get().storageType
        set({ apiKey: null, geminiKey: null, perplexityKey: null, claudeKey: null })

        const storage = getStorage(storageType)
        storage?.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
        storage?.removeItem(STORAGE_KEYS.GEMINI_API_KEY)
        storage?.removeItem(STORAGE_KEYS.PERPLEXITY_API_KEY)
        storage?.removeItem(STORAGE_KEYS.CLAUDE_API_KEY)
      },
    }),
    {
      name: 'ai-config-storage',
      // Keys are NOT persisted through Zustand (they're encrypted into their
      // own storage entries by the actions above); nothing else needs to
      // persist since the model moved to model-prefs. The middleware stays for
      // onRehydrateStorage, which loads the encrypted keys + storage type.
      partialize: () => ({}),
      onRehydrateStorage: () => async (state) => {
        if (!state || typeof window === 'undefined') return

        // Load storage type preference. No saved preference: legacy users who
        // already have keys in localStorage keep that behavior (and we persist
        // the choice so it stays stable); fresh users default to sessionStorage
        // so keys don't outlive the browser session on shared workstations.
        const savedStorageType = window.localStorage.getItem(STORAGE_KEYS.STORAGE_TYPE) as StorageType | null
        let storageType: StorageType
        if (savedStorageType) {
          storageType = savedStorageType
        } else {
          const hasLegacyLocalKeys =
            window.localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) !== null ||
            window.localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) !== null ||
            window.localStorage.getItem(STORAGE_KEYS.PERPLEXITY_API_KEY) !== null
          storageType = hasLegacyLocalKeys ? 'localStorage' : 'sessionStorage'
          window.localStorage.setItem(STORAGE_KEYS.STORAGE_TYPE, storageType)
        }
        
        // Load encrypted keys from appropriate storage (async)
        const [apiKey, geminiKey, perplexityKey, claudeKey] = await Promise.all([
          loadEncryptedKey(storageType, STORAGE_KEYS.OPENAI_API_KEY),
          loadEncryptedKey(storageType, STORAGE_KEYS.GEMINI_API_KEY),
          loadEncryptedKey(storageType, STORAGE_KEYS.PERPLEXITY_API_KEY),
          loadEncryptedKey(storageType, STORAGE_KEYS.CLAUDE_API_KEY),
        ])
        
        // Update state - this will trigger re-renders in components
        state.apiKey = apiKey
        state.geminiKey = geminiKey
        state.perplexityKey = perplexityKey
        state.claudeKey = claudeKey
        state.storageType = storageType
      },
    }
  )
)

// Selectors with stable references for SSR
const selectApiKey = (state: AiConfigState) => state.apiKey
const selectGeminiKey = (state: AiConfigState) => state.geminiKey
const selectPerplexityKey = (state: AiConfigState) => state.perplexityKey
const selectClaudeKey = (state: AiConfigState) => state.claudeKey

export const useApiKey = () => useAiConfigStore(selectApiKey)
export const useGeminiKey = () => useAiConfigStore(selectGeminiKey)
export const usePerplexityKey = () => useAiConfigStore(selectPerplexityKey)
export const useClaudeKey = () => useAiConfigStore(selectClaudeKey)

// Use useShallow to prevent infinite loops from object reference changes
export const useAllApiKeys = () => useAiConfigStore(
  useShallow((state) => ({
    apiKey: state.apiKey,
    geminiKey: state.geminiKey,
    perplexityKey: state.perplexityKey,
    claudeKey: state.claudeKey,
  }))
)
