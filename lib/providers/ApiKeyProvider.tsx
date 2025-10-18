// lib/providers/ApiKeyProvider.tsx
"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

type StorageMode = "session" | "local"
type Ctx = { apiKey: string; setApiKey: (k: string) => void; clearApiKey: () => void }

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

  const [apiKey, setApiKeyState] = useState("")

  useEffect(() => {
    if (!store) return
    try {
      const v = store.getItem(storageKey)
      if (v) setApiKeyState(v)
    } catch {}
  }, [store, storageKey])

  const setApiKey = (k: string) => {
    setApiKeyState(k)
    if (!store) return
    try {
      if (k) store.setItem(storageKey, k)
      else store.removeItem(storageKey)
    } catch {}
  }

  const clearApiKey = () => setApiKey("")

  const value = useMemo(() => ({ apiKey, setApiKey, clearApiKey }), [apiKey])

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext)
  if (!ctx) throw new Error("useApiKey must be used inside <ApiKeyProvider>")
  return ctx
}
