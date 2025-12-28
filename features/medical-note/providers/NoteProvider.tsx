// features/medical-note/providers/NoteProvider.tsx
"use client"
import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { DEFAULT_MODEL_ID, isModelId } from "@/features/medical-note/constants/models"

type Ctx = {
  asrText: string
  setAsrText: Dispatch<SetStateAction<string>>
  prompt: string
  setPrompt: Dispatch<SetStateAction<string>>
  gptResponse: string
  setGptResponse: Dispatch<SetStateAction<string>>
  model: string
  setModel: Dispatch<SetStateAction<string>>
}

const NoteContext = createContext<Ctx | null>(null)

const MODEL_STORAGE_KEY = "clinical-note:model"

export function NoteProvider({ children }: { children: React.ReactNode }) {
  const [asrText, setAsrText] = useState("")
  const [prompt, setPrompt] = useState("Generate Medical Summary")
  const [gptResponse, setGptResponse] = useState("")
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID)

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY)
    if (stored && isModelId(stored)) {
      const next = stored
      setModel(next)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(MODEL_STORAGE_KEY, model)
  }, [model])

  const value: Ctx = useMemo(() => ({
    asrText, setAsrText,
    prompt, setPrompt,
    gptResponse, setGptResponse,
    model, setModel,
  }), [asrText, prompt, gptResponse, model])

  return <NoteContext.Provider value={value}>{children}</NoteContext.Provider>
}

export function useNote() {
  const ctx = useContext(NoteContext)
  if (!ctx) throw new Error("useNote must be used inside <NoteProvider>")
  return ctx
}
