// Application Provider: API Keys
"use client"

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { StorageService } from '@/src/shared/utils/storage.utils'
import { STORAGE_KEYS } from '@/src/shared/constants/data-selection.constants'
import { encrypt, decrypt, clearSessionKey } from '@/src/shared/utils/crypto.utils'

type StorageType = 'localStorage' | 'sessionStorage'

interface ApiKeyContextValue {
  apiKey: string | null
  geminiKey: string | null
  perplexityKey: string | null
  storageType: StorageType
  setApiKey: (key: string | null) => Promise<void>
  setGeminiKey: (key: string | null) => Promise<void>
  setPerplexityKey: (key: string | null) => Promise<void>
  setStorageType: (type: StorageType) => Promise<void>
  clearKeys: () => void
  clearApiKey: () => void
  clearGeminiKey: () => void
  clearPerplexityKey: () => void
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null)

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null)
  const [geminiKey, setGeminiKeyState] = useState<string | null>(null)
  const [perplexityKey, setPerplexityKeyState] = useState<string | null>(null)
  const [storageType, setStorageTypeState] = useState<StorageType>('localStorage')

  // Load keys on mount
  useEffect(() => {
    const loadKeys = async () => {
      const storage = new StorageService(storageType)
      const loadedApiKey = storage.get<string>(STORAGE_KEYS.API_KEY)
      const loadedGeminiKey = storage.get<string>(STORAGE_KEYS.GEMINI_KEY)
      const loadedPerplexityKey = storage.get<string>(STORAGE_KEYS.PERPLEXITY_KEY)
      
      // Decrypt keys if they exist
      if (loadedApiKey) {
        try {
          const decryptedKey = await decrypt(loadedApiKey)
          setApiKeyState(decryptedKey)
        } catch (error) {
          storage.remove(STORAGE_KEYS.API_KEY)
          setApiKeyState(null)
        }
      }
      if (loadedGeminiKey) {
        try {
          const decryptedKey = await decrypt(loadedGeminiKey)
          setGeminiKeyState(decryptedKey)
        } catch (error) {
          storage.remove(STORAGE_KEYS.GEMINI_KEY)
          setGeminiKeyState(null)
        }
      }
      if (loadedPerplexityKey) {
        try {
          const decryptedKey = await decrypt(loadedPerplexityKey)
          setPerplexityKeyState(decryptedKey)
        } catch (error) {
          storage.remove(STORAGE_KEYS.PERPLEXITY_KEY)
          setPerplexityKeyState(null)
        }
      }
    }
    
    loadKeys()
  }, [storageType])

  const setApiKey = async (key: string | null) => {
    const storage = new StorageService(storageType)
    if (key) {
      // Encrypt before storing
      const encryptedKey = await encrypt(key)
      storage.set(STORAGE_KEYS.API_KEY, encryptedKey)
      setApiKeyState(key)
    } else {
      storage.remove(STORAGE_KEYS.API_KEY)
      setApiKeyState(null)
    }
  }

  const setGeminiKey = async (key: string | null) => {
    const storage = new StorageService(storageType)
    if (key) {
      // Encrypt before storing
      const encryptedKey = await encrypt(key)
      storage.set(STORAGE_KEYS.GEMINI_KEY, encryptedKey)
      setGeminiKeyState(key)
    } else {
      storage.remove(STORAGE_KEYS.GEMINI_KEY)
      setGeminiKeyState(null)
    }
  }

  const setPerplexityKey = async (key: string | null) => {
    const storage = new StorageService(storageType)
    if (key) {
      // Encrypt before storing
      const encryptedKey = await encrypt(key)
      storage.set(STORAGE_KEYS.PERPLEXITY_KEY, encryptedKey)
      setPerplexityKeyState(key)
    } else {
      storage.remove(STORAGE_KEYS.PERPLEXITY_KEY)
      setPerplexityKeyState(null)
    }
  }

  const setStorageType = async (type: StorageType) => {
    // Migrate keys to new storage
    const oldStorage = new StorageService(storageType)
    const newStorage = new StorageService(type)

    const oldApiKey = oldStorage.get<string>(STORAGE_KEYS.API_KEY)
    const oldGeminiKey = oldStorage.get<string>(STORAGE_KEYS.GEMINI_KEY)
    const oldPerplexityKey = oldStorage.get<string>(STORAGE_KEYS.PERPLEXITY_KEY)

    // Decrypt from old storage and re-encrypt for new storage
    if (oldApiKey) {
      const decrypted = await decrypt(oldApiKey)
      const encrypted = await encrypt(decrypted)
      newStorage.set(STORAGE_KEYS.API_KEY, encrypted)
    }
    if (oldGeminiKey) {
      const decrypted = await decrypt(oldGeminiKey)
      const encrypted = await encrypt(decrypted)
      newStorage.set(STORAGE_KEYS.GEMINI_KEY, encrypted)
    }
    if (oldPerplexityKey) {
      const decrypted = await decrypt(oldPerplexityKey)
      const encrypted = await encrypt(decrypted)
      newStorage.set(STORAGE_KEYS.PERPLEXITY_KEY, encrypted)
    }

    oldStorage.remove(STORAGE_KEYS.API_KEY)
    oldStorage.remove(STORAGE_KEYS.GEMINI_KEY)
    oldStorage.remove(STORAGE_KEYS.PERPLEXITY_KEY)

    setStorageTypeState(type)
  }

  const clearKeys = () => {
    const storage = new StorageService(storageType)
    storage.remove(STORAGE_KEYS.API_KEY)
    storage.remove(STORAGE_KEYS.GEMINI_KEY)
    storage.remove(STORAGE_KEYS.PERPLEXITY_KEY)
    clearSessionKey() // Clear encryption key
    setApiKeyState(null)
    setGeminiKeyState(null)
    setPerplexityKeyState(null)
  }

  const clearApiKey = () => {
    const storage = new StorageService(storageType)
    storage.remove(STORAGE_KEYS.API_KEY)
    setApiKeyState(null)
  }

  const clearGeminiKey = () => {
    const storage = new StorageService(storageType)
    storage.remove(STORAGE_KEYS.GEMINI_KEY)
    setGeminiKeyState(null)
  }

  const clearPerplexityKey = () => {
    const storage = new StorageService(storageType)
    storage.remove(STORAGE_KEYS.PERPLEXITY_KEY)
    setPerplexityKeyState(null)
  }

  const value = useMemo(
    () => ({
      apiKey,
      geminiKey,
      perplexityKey,
      storageType,
      setApiKey,
      setGeminiKey,
      setPerplexityKey,
      setStorageType,
      clearKeys,
      clearApiKey,
      clearGeminiKey,
      clearPerplexityKey
    }),
    [apiKey, geminiKey, perplexityKey, storageType]
  )

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
}

export function useApiKey() {
  const context = useContext(ApiKeyContext)
  if (!context) {
    throw new Error('useApiKey must be used within ApiKeyProvider')
  }
  return context
}
