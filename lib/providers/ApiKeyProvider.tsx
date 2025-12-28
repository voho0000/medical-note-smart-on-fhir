// lib/providers/ApiKeyProvider.tsx
"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

type StorageMode = "session" | "local"
type ApiKeysState = { openai: string; gemini: string }
type Ctx = {
  apiKey: string
  setApiKey: (k: string) => void
  clearApiKey: () => void
  geminiKey: string
  setGeminiKey: (k: string) => void
  clearGeminiKey: () => void
}

const DEFAULT_KEYS: ApiKeysState = { openai: "", gemini: "" }

const ApiKeyContext = createContext<Ctx | null>(null)

export function ApiKeyProvider({
  children,
  storage = "session",
  storageKey = "OPENAI_API_KEY",
}: {
  children: React.ReactNode
  storage?: StorageMode
  storageKey?: string
}) {
  const isBrowser = typeof window !== "undefined"

  const store: Storage | null = useMemo(() => {
    if (!isBrowser) return null
    return storage === "local" ? window.localStorage : window.sessionStorage
  }, [isBrowser, storage])

  const [keys, setKeys] = useState<ApiKeysState>(DEFAULT_KEYS)

  useEffect(() => {
    if (!store) return
    try {
      const stored = store.getItem(storageKey)
      if (!stored) return

      try {
        const parsed = JSON.parse(stored)
        if (typeof parsed === "string") {
          setKeys({ openai: parsed, gemini: "" })
          return
        }

        if (parsed && typeof parsed === "object") {
          const record = parsed as Record<string, unknown>
          const openai = typeof record.openai === "string" ? record.openai : ""
          const gemini = typeof record.gemini === "string" ? record.gemini : ""
          setKeys({ openai, gemini })
          return
        }
      } catch {
        setKeys({ openai: stored, gemini: "" })
        return
      }
    } catch {
      // ignore storage read failures
    }
  }, [store, storageKey])

  useEffect(() => {
    if (!store) return
    try {
      const hasAnyKey = keys.openai.trim().length > 0 || keys.gemini.trim().length > 0
      if (!hasAnyKey) {
        store.removeItem(storageKey)
        return
      }
      store.setItem(storageKey, JSON.stringify(keys))
    } catch {
      // ignore storage write failures
    }
  }, [keys, store, storageKey])

  const setApiKey = useCallback((k: string) => {
    setKeys((prev) => ({ ...prev, openai: k }))
  }, [])

  const clearApiKey = useCallback(() => {
    setKeys((prev) => ({ ...prev, openai: "" }))
  }, [])

  const setGeminiKey = useCallback((k: string) => {
    setKeys((prev) => ({ ...prev, gemini: k }))
  }, [])

  const clearGeminiKey = useCallback(() => {
    setKeys((prev) => ({ ...prev, gemini: "" }))
  }, [])

  const value = useMemo(
    () => ({
      apiKey: keys.openai,
      setApiKey,
      clearApiKey,
      geminiKey: keys.gemini,
      setGeminiKey,
      clearGeminiKey,
    }),
    [clearApiKey, clearGeminiKey, keys.gemini, keys.openai, setApiKey, setGeminiKey],
  )

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext)
  if (!ctx) throw new Error("useApiKey must be used inside <ApiKeyProvider>")
  return ctx
}
