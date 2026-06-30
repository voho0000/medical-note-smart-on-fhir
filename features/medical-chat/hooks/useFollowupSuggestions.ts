"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useUnifiedAi } from "@/src/application/hooks/ai/use-unified-ai.hook"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import {
  generateFollowupSuggestionsUseCase,
  FOLLOWUP_MODEL_ID,
  type FollowupSuggestion,
} from "@/src/core/use-cases/chat/generate-followup-suggestions.use-case"

/**
 * Generates "next step" suggestion chips after a chat answer completes.
 *
 * Uses a DEDICATED useUnifiedAi instance (so its loading/error never touches the
 * chat UI) and a cheap model via the same proxy/key path the rest of the app
 * uses. Fails closed: any error → no chips, never blocks chat. Stale-guarded so
 * a newer request always wins.
 */
export function useFollowupSuggestions() {
  const { locale } = useLanguage()
  const { audience } = useAudience()
  const ai = useUnifiedAi()
  // Keep the (identity-unstable) stream fn behind a ref so `generate` stays
  // stable and the trigger effect in MedicalChat doesn't churn.
  const streamRef = useRef(ai.stream)
  useEffect(() => { streamRef.current = ai.stream }, [ai.stream])

  const [suggestions, setSuggestions] = useState<FollowupSuggestion[]>([])
  const reqRef = useRef(0)

  const generate = useCallback(async (
    lastUser: string,
    lastAssistant: string,
    opts?: { recentUserMessages?: string[]; isDeepMode?: boolean },
  ) => {
    if (!lastUser?.trim() || !lastAssistant?.trim()) return
    const reqId = ++reqRef.current
    setSuggestions([])
    try {
      const messages = generateFollowupSuggestionsUseCase.buildMessages({
        lastUser,
        lastAssistant,
        locale,
        audience,
        isDeepMode: opts?.isDeepMode,
        recentUserMessages: opts?.recentUserMessages,
      })
      const full = await streamRef.current(messages, {
        modelId: FOLLOWUP_MODEL_ID,
        temperature: 0.7,
      })
      if (reqId !== reqRef.current) return // a newer request superseded us
      setSuggestions(generateFollowupSuggestionsUseCase.parse(full))
    } catch {
      // Fail closed — suggestions are a nice-to-have, never surface an error.
      if (reqId === reqRef.current) setSuggestions([])
    }
  }, [locale, audience])

  const clear = useCallback(() => {
    reqRef.current++ // invalidate any in-flight request
    setSuggestions([])
  }, [])

  return { suggestions, generate, clear }
}
