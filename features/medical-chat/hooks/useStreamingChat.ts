// Streaming Chat Hook - Clean Architecture Implementation
"use client"

import { useState, useCallback, useRef } from "react"
import { useNote, type ChatMessage } from "@/src/application/providers/note.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useUnifiedAi } from "@/src/application/hooks/ai/use-unified-ai.hook"
import { getUserErrorMessage } from "@/src/core/errors"
import { truncateToContextWindow, getTokenStats } from "@/src/shared/utils/context-window-manager"

export function useStreamingChat(systemPrompt: string, modelId: string, onInputClear?: () => void) {
  const { chatMessages, setChatMessages } = useNote()
  const { locale } = useLanguage()
  const ai = useUnifiedAi()
  const [error, setError] = useState<Error | null>(null)
  const hasReceivedChunkRef = useRef(false)

  const handleSend = useCallback(
    async (input: string) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed) return

      // Create user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      }
      const newMessages = [...chatMessages, userMessage]
      setChatMessages(newMessages)

      // Create placeholder for assistant message
      const assistantMessageId = crypto.randomUUID()
      setChatMessages([...newMessages, {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        modelId,
      }])

      setError(null)

      try {
        // Prepare messages
        const userMessages = newMessages.map((m) => ({ role: m.role, content: m.content }))
        
        // Check token usage and truncate if needed
        const stats = getTokenStats(userMessages, { modelId, systemPrompt })
        console.log(`[Chat] Token usage: ${stats.totalTokens}/${stats.contextLimit} (${stats.utilizationPercent}%)`)
        
        // Truncate to fit context window
        const truncatedMessages = truncateToContextWindow(userMessages, { 
          modelId, 
          systemPrompt,
          maxResponseTokens: 4000 
        })

        // Build final messages for API with proper typing
        const apiMessages = [
          { role: "system" as const, content: systemPrompt },
          ...truncatedMessages.map(m => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content
          })),
        ]

        // Stream response using unified AI
        await ai.stream(apiMessages, {
          modelId,
          onChunk: (content: string) => {
            // Clear input on first chunk (streaming started successfully)
            if (!hasReceivedChunkRef.current && onInputClear) {
              hasReceivedChunkRef.current = true
              onInputClear()
            }
            setChatMessages((prev) =>
              prev.map((m) => m.id === assistantMessageId ? { ...m, content } : m)
            )
          },
        })
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        
        const errorMessage = getUserErrorMessage(err)
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: `❌ ${errorMessage}` } : m)
        )
      }
    },
    [chatMessages, modelId, setChatMessages, systemPrompt, ai, onInputClear]
  )

  const handleReset = useCallback(() => {
    ai.stop()
    setChatMessages([])
  }, [setChatMessages, ai])

  const stopGeneration = useCallback(() => {
    ai.stop()
  }, [ai])

  return { messages: chatMessages, isLoading: ai.isLoading, error, handleSend, handleReset, stopGeneration }
}
