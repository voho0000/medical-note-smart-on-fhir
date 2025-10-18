// features/medical-note/providers/NoteProvider.tsx
"use client"
import { createContext, useContext, useMemo, useState, type Dispatch, type SetStateAction } from "react"

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

export function NoteProvider({ children }: { children: React.ReactNode }) {
  const [asrText, setAsrText] = useState("")
  const [prompt, setPrompt] = useState("Generate Medical Summary")
  const [gptResponse, setGptResponse] = useState("")
  const [model, setModel] = useState("gpt-4.1")

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
