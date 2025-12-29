// System Prompt Management Hook
import { useMemo, useState, useCallback } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"

export function useSystemPrompt() {
  const { t } = useLanguage()
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string | null>(null)

  const defaultSystemPrompt = useMemo(() => t.chat.systemPrompt, [t.chat.systemPrompt])

  const systemPrompt = useMemo(() => {
    return customSystemPrompt || defaultSystemPrompt
  }, [customSystemPrompt, defaultSystemPrompt])
  
  const updateSystemPrompt = useCallback((newPrompt: string) => {
    setCustomSystemPrompt(newPrompt)
  }, [])
  
  const resetSystemPrompt = useCallback(() => {
    setCustomSystemPrompt(null)
  }, [])

  return { 
    systemPrompt,
    updateSystemPrompt,
    resetSystemPrompt,
    isCustomPrompt: customSystemPrompt !== null,
    defaultSystemPrompt
  }
}
