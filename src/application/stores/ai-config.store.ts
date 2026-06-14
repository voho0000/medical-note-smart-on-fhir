/**
 * AI Configuration Store (Zustand)
 * 
 * Consolidates API keys and model selection into a single store.
 * Replaces ApiKeyProvider and ModelSelectionProvider.
 * 
 * Benefits:
 * - No Provider nesting needed
 * - Better performance (granular subscriptions)
 * - Simpler code
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { encrypt, decrypt } from '@/src/shared/utils/crypto.utils'
import { DEFAULT_MODEL_ID, isModelId, getModelDefinition, getBaseModelIdForProvider } from '@/src/shared/constants/ai-models.constants'

type StorageType = 'localStorage' | 'sessionStorage'

interface AiConfigState {
  // API Keys
  apiKey: string | null
  geminiKey: string | null
  perplexityKey: string | null
  claudeKey: string | null
  storageType: StorageType
  
  // Model Selection
  model: string
  
  // Actions
  setApiKey: (key: string | null) => void
  setGeminiKey: (key: string | null) => void
  setPerplexityKey: (key: string | null) => void
  setClaudeKey: (key: string | null) => void
  setStorageType: (type: StorageType) => void
  setModel: (model: string) => void
  clearAllKeys: () => void
}

const STORAGE_KEYS = {
  OPENAI_API_KEY: 'openai_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  PERPLEXITY_API_KEY: 'perplexity_api_key',
  CLAUDE_API_KEY: 'claude_api_key',
  STORAGE_TYPE: 'api_key_storage_type',
  MODEL: 'selected_model',
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
    return await decrypt(encrypted)
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

// When the selected model needs a user key for its provider and that key is
// now gone, drop back to the provider's free base model. Prevents the "picked a
// premium model, then deleted the API key → generation errors" trap, and covers
// every removal path (settings clear button, logout/clearAllKeys, …) in one
// place. Returns the fallback model id, or null if no change is needed.
const modelFallbackForMissingKey = (state: {
  model: string
  apiKey: string | null
  geminiKey: string | null
  claudeKey: string | null
}): string | null => {
  const def = getModelDefinition(state.model)
  if (!def?.requiresUserKey) return null
  const key =
    def.provider === 'openai' ? state.apiKey :
    def.provider === 'gemini' ? state.geminiKey :
    state.claudeKey
  if (key) return null
  const fallback = getBaseModelIdForProvider(def.provider) ?? DEFAULT_MODEL_ID
  return fallback === state.model ? null : fallback
}

export const useAiConfigStore = create<AiConfigState>()(
  persist(
    (set, get) => ({
      // Initial state — sessionStorage by default (shared-workstation safety);
      // onRehydrateStorage migrates legacy users who already hold keys in
      // localStorage without a saved preference
      apiKey: null,
      geminiKey: null,
      perplexityKey: null,
      claudeKey: null,
      storageType: 'sessionStorage',
      model: DEFAULT_MODEL_ID,
      
      // Actions
      setApiKey: (key) => {
        set({ apiKey: key })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.OPENAI_API_KEY, key).catch(console.error)
        // Removing the key may strand a premium model — drop to the free tier
        if (!key) {
          const fallback = modelFallbackForMissingKey(get())
          if (fallback) set({ model: fallback })
        }
      },

      setGeminiKey: (key) => {
        set({ geminiKey: key })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.GEMINI_API_KEY, key).catch(console.error)
        if (!key) {
          const fallback = modelFallbackForMissingKey(get())
          if (fallback) set({ model: fallback })
        }
      },

      setPerplexityKey: (key) => {
        set({ perplexityKey: key })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.PERPLEXITY_API_KEY, key).catch(console.error)
      },

      setClaudeKey: (key) => {
        set({ claudeKey: key })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.CLAUDE_API_KEY, key).catch(console.error)
        if (!key) {
          const fallback = modelFallbackForMissingKey(get())
          if (fallback) set({ model: fallback })
        }
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
      
      setModel: (model) => {
        set({ model })
      },
      
      clearAllKeys: () => {
        const storageType = get().storageType
        set({ apiKey: null, geminiKey: null, perplexityKey: null, claudeKey: null })

        const storage = getStorage(storageType)
        storage?.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
        storage?.removeItem(STORAGE_KEYS.GEMINI_API_KEY)
        storage?.removeItem(STORAGE_KEYS.PERPLEXITY_API_KEY)
        storage?.removeItem(STORAGE_KEYS.CLAUDE_API_KEY)

        // Logout strips all keys — drop a premium model back to the free tier
        const fallback = modelFallbackForMissingKey(get())
        if (fallback) set({ model: fallback })
      },
    }),
    {
      name: 'ai-config-storage',
      partialize: (state) => ({ model: state.model }), // Only persist model in Zustand storage
      onRehydrateStorage: () => async (state) => {
        if (!state || typeof window === 'undefined') return

        // Model lineup changes between releases — a persisted id that no
        // longer exists falls back to the default instead of dead-ending
        if (!isModelId(state.model)) {
          state.model = DEFAULT_MODEL_ID
        }
        
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
const selectModel = (state: AiConfigState) => state.model

export const useApiKey = () => useAiConfigStore(selectApiKey)
export const useGeminiKey = () => useAiConfigStore(selectGeminiKey)
export const usePerplexityKey = () => useAiConfigStore(selectPerplexityKey)
export const useClaudeKey = () => useAiConfigStore(selectClaudeKey)
export const useModel = () => useAiConfigStore(selectModel)

// Use useShallow to prevent infinite loops from object reference changes
export const useAllApiKeys = () => useAiConfigStore(
  useShallow((state) => ({
    apiKey: state.apiKey,
    geminiKey: state.geminiKey,
    perplexityKey: state.perplexityKey,
    claudeKey: state.claudeKey,
  }))
)
