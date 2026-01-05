// Streaming Chat Hook - Clean Architecture Implementation
"use client"

import { useState, useCallback, useRef } from "react"
import { useNote, type ChatMessage } from "@/src/application/providers/note.provider"
import { useApiKey } from "@/src/application/providers/api-key.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { StreamOrchestrator } from "@/src/infrastructure/ai/streaming/stream-orchestrator"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { truncateToContextWindow, getTokenStats } from "@/src/shared/utils/context-window-manager"
import { formatErrorMessage } from "../utils/formatErrorMessage"

export function useStreamingChat(systemPrompt: string, modelId: string, onInputClear?: () => void) {
  const { chatMessages, setChatMessages } = useNote()
  const { apiKey: openAiKey, geminiKey } = useApiKey()
  const { locale } = useLanguage()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const orchestratorRef = useRef(new StreamOrchestrator())
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

      setIsLoading(true)
      setError(null)
      abortControllerRef.current = new AbortController()

      try {
        const modelDef = getModelDefinition(modelId)
        const provider = modelDef?.provider ?? "openai"
        const apiKey = provider === "openai" ? openAiKey : geminiKey

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

        // Build final messages for API
        const apiMessages = [
          { role: "system", content: systemPrompt },
          ...truncatedMessages,
        ]

        // Stream response using orchestrator
        await orchestratorRef.current.stream({
          messages: apiMessages,
          model: modelId,
          apiKey,
          signal: abortControllerRef.current.signal,
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
        
        const errorObj = err instanceof Error ? err : new Error("Failed to generate response.")
        setError(errorObj)
        const formattedError = formatErrorMessage(errorObj, locale)
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: formattedError } : m)
        )
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    [chatMessages, modelId, openAiKey, geminiKey, setChatMessages, systemPrompt]
  )

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort()
    setChatMessages([])
  }, [setChatMessages])

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }, [])

  return { messages: chatMessages, isLoading, error, handleSend, handleReset, stopGeneration }
}
