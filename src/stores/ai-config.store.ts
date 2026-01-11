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
import { encrypt, decrypt } from '@/src/shared/utils/crypto.utils'

type StorageType = 'localStorage' | 'sessionStorage'

interface AiConfigState {
  // API Keys
  apiKey: string | null
  geminiKey: string | null
  perplexityKey: string | null
  storageType: StorageType
  
  // Model Selection
  model: string
  
  // Actions
  setApiKey: (key: string | null) => void
  setGeminiKey: (key: string | null) => void
  setPerplexityKey: (key: string | null) => void
  setStorageType: (type: StorageType) => void
  setModel: (model: string) => void
  clearAllKeys: () => void
}

const STORAGE_KEYS = {
  OPENAI_API_KEY: 'openai_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  PERPLEXITY_API_KEY: 'perplexity_api_key',
  STORAGE_TYPE: 'api_key_storage_type',
  MODEL: 'selected_model',
}

const DEFAULT_MODEL_ID = 'gpt-4o-mini'

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

export const useAiConfigStore = create<AiConfigState>()(
  persist(
    (set, get) => ({
      // Initial state
      apiKey: null,
      geminiKey: null,
      perplexityKey: null,
      storageType: 'localStorage',
      model: DEFAULT_MODEL_ID,
      
      // Actions
      setApiKey: (key) => {
        set({ apiKey: key })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.OPENAI_API_KEY, key).catch(console.error)
      },
      
      setGeminiKey: (key) => {
        set({ geminiKey: key })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.GEMINI_API_KEY, key).catch(console.error)
      },
      
      setPerplexityKey: (key) => {
        set({ perplexityKey: key })
        // Fire and forget - async save
        saveEncryptedKey(get().storageType, STORAGE_KEYS.PERPLEXITY_API_KEY, key).catch(console.error)
      },
      
      setStorageType: (type) => {
        const oldType = get().storageType
        set({ storageType: type })
        
        // Migrate keys to new storage (async)
        if (typeof window !== 'undefined') {
          const { apiKey, geminiKey, perplexityKey } = get()
          
          // Clear old storage
          const oldStorage = getStorage(oldType)
          oldStorage?.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
          oldStorage?.removeItem(STORAGE_KEYS.GEMINI_API_KEY)
          oldStorage?.removeItem(STORAGE_KEYS.PERPLEXITY_API_KEY)
          
          // Save to new storage (fire and forget)
          Promise.all([
            saveEncryptedKey(type, STORAGE_KEYS.OPENAI_API_KEY, apiKey),
            saveEncryptedKey(type, STORAGE_KEYS.GEMINI_API_KEY, geminiKey),
            saveEncryptedKey(type, STORAGE_KEYS.PERPLEXITY_API_KEY, perplexityKey),
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
        set({ apiKey: null, geminiKey: null, perplexityKey: null })
        
        const storage = getStorage(storageType)
        storage?.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
        storage?.removeItem(STORAGE_KEYS.GEMINI_API_KEY)
        storage?.removeItem(STORAGE_KEYS.PERPLEXITY_API_KEY)
      },
    }),
    {
      name: 'ai-config-storage',
      partialize: (state) => ({ model: state.model }), // Only persist model in Zustand storage
      onRehydrateStorage: () => async (state) => {
        if (!state || typeof window === 'undefined') return
        
        // Load storage type preference
        const savedStorageType = window.localStorage.getItem(STORAGE_KEYS.STORAGE_TYPE) as StorageType | null
        const storageType = savedStorageType || 'localStorage'
        
        // Load encrypted keys from appropriate storage (async)
        const [apiKey, geminiKey, perplexityKey] = await Promise.all([
          loadEncryptedKey(storageType, STORAGE_KEYS.OPENAI_API_KEY),
          loadEncryptedKey(storageType, STORAGE_KEYS.GEMINI_API_KEY),
          loadEncryptedKey(storageType, STORAGE_KEYS.PERPLEXITY_API_KEY),
        ])
        
        state.apiKey = apiKey
        state.geminiKey = geminiKey
        state.perplexityKey = perplexityKey
        state.storageType = storageType
      },
    }
  )
)

// Selectors for optimized re-renders
export const useApiKey = () => useAiConfigStore((state) => state.apiKey)
export const useGeminiKey = () => useAiConfigStore((state) => state.geminiKey)
export const usePerplexityKey = () => useAiConfigStore((state) => state.perplexityKey)
export const useModel = () => useAiConfigStore((state) => state.model)
export const useAllApiKeys = () => useAiConfigStore((state) => ({
  apiKey: state.apiKey,
  geminiKey: state.geminiKey,
  perplexityKey: state.perplexityKey,
}))
