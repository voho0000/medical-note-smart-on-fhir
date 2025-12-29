// Application Provider: API Keys
"use client"

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { StorageService } from '@/src/shared/utils/storage.utils'
import { STORAGE_KEYS } from '@/src/shared/constants/data-selection.constants'

type StorageType = 'localStorage' | 'sessionStorage'

interface ApiKeyContextValue {
  apiKey: string | null
  geminiKey: string | null
  storageType: StorageType
  setApiKey: (key: string | null) => void
  setGeminiKey: (key: string | null) => void
  setStorageType: (type: StorageType) => void
  clearKeys: () => void
  clearApiKey: () => void
  clearGeminiKey: () => void
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null)

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null)
  const [geminiKey, setGeminiKeyState] = useState<string | null>(null)
  const [storageType, setStorageTypeState] = useState<StorageType>('localStorage')

  // Load keys on mount
  useEffect(() => {
    const storage = new StorageService(storageType)
    const loadedApiKey = storage.get<string>(STORAGE_KEYS.API_KEY)
    const loadedGeminiKey = storage.get<string>(STORAGE_KEYS.GEMINI_KEY)
    
    if (loadedApiKey) setApiKeyState(loadedApiKey)
    if (loadedGeminiKey) setGeminiKeyState(loadedGeminiKey)
  }, [storageType])

  const setApiKey = (key: string | null) => {
    const storage = new StorageService(storageType)
    if (key) {
      storage.set(STORAGE_KEYS.API_KEY, key)
    } else {
      storage.remove(STORAGE_KEYS.API_KEY)
    }
    setApiKeyState(key)
  }

  const setGeminiKey = (key: string | null) => {
    const storage = new StorageService(storageType)
    if (key) {
      storage.set(STORAGE_KEYS.GEMINI_KEY, key)
    } else {
      storage.remove(STORAGE_KEYS.GEMINI_KEY)
    }
    setGeminiKeyState(key)
  }

  const setStorageType = (type: StorageType) => {
    // Migrate keys to new storage
    const oldStorage = new StorageService(storageType)
    const newStorage = new StorageService(type)

    const oldApiKey = oldStorage.get<string>(STORAGE_KEYS.API_KEY)
    const oldGeminiKey = oldStorage.get<string>(STORAGE_KEYS.GEMINI_KEY)

    if (oldApiKey) newStorage.set(STORAGE_KEYS.API_KEY, oldApiKey)
    if (oldGeminiKey) newStorage.set(STORAGE_KEYS.GEMINI_KEY, oldGeminiKey)

    oldStorage.remove(STORAGE_KEYS.API_KEY)
    oldStorage.remove(STORAGE_KEYS.GEMINI_KEY)

    setStorageTypeState(type)
  }

  const clearKeys = () => {
    const storage = new StorageService(storageType)
    storage.remove(STORAGE_KEYS.API_KEY)
    storage.remove(STORAGE_KEYS.GEMINI_KEY)
    setApiKeyState(null)
    setGeminiKeyState(null)
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

  const value = useMemo(
    () => ({
      apiKey,
      geminiKey,
      storageType,
      setApiKey,
      setGeminiKey,
      setStorageType,
      clearKeys,
      clearApiKey,
      clearGeminiKey
    }),
    [apiKey, geminiKey, storageType]
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
