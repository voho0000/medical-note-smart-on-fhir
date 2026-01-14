// Streaming Chat Hook - Clean Architecture Implementation
"use client"

import { useState, useCallback, useRef } from "react"
import { useChatMessages, useSetChatMessages, type ChatMessage } from "@/src/application/stores/chat.store"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useUnifiedAi } from "@/src/application/hooks/ai/use-unified-ai.hook"
import { getUserErrorMessage } from "@/src/core/errors"
import { truncateToContextWindow, getTokenStats } from "@/src/shared/utils/context-window-manager"
import { addMessagePair } from "@/src/shared/utils/chat-message.utils"

export function useStreamingChat(
  systemPrompt: string, 
  modelId: string, 
  onInputClear?: () => void,
  onStreamComplete?: () => void
) {
  const chatMessages = useChatMessages()
  const setChatMessages = useSetChatMessages()
  const { locale } = useLanguage()
  const ai = useUnifiedAi()
  const [error, setError] = useState<Error | null>(null)
  const hasReceivedChunkRef = useRef(false)

  const handleSend = useCallback(
    async (input: string) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed) return

      // Create user message and assistant placeholder
      const { messages: newMessages, assistantMessageId } = addMessagePair(
        chatMessages,
        trimmed,
        modelId,
        "" // Empty initial content
      )
      setChatMessages(newMessages)

      setError(null)

      try {
        // Prepare messages (exclude the empty assistant placeholder)
        const userMessages = newMessages
          .filter(m => m.id !== assistantMessageId)
          .map((m) => ({ role: m.role, content: m.content }))
        
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
        
        // Trigger save after streaming completes
        console.log('[Streaming] Completed, onStreamComplete exists:', !!onStreamComplete)
        if (onStreamComplete) {
          console.log('[Streaming] Calling onStreamComplete callback')
          try {
            await onStreamComplete()
            console.log('[Streaming] onStreamComplete callback completed')
          } catch (error) {
            console.error('[Streaming] onStreamComplete callback failed:', error)
          }
        } else {
          console.warn('[Streaming] No onStreamComplete callback provided')
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        
        const errorMessage = getUserErrorMessage(error)
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: `❌ ${errorMessage}` } : m)
        )
      }
    },
    [chatMessages, modelId, setChatMessages, systemPrompt, ai, onInputClear, onStreamComplete]
  )

  const handleReset = useCallback(() => {
    ai.stop()
    setChatMessages([])
    // Clear current session ID to start a new conversation
    const { setCurrentSessionId } = require('@/src/application/stores/chat-history.store').useChatHistoryStore.getState()
    setCurrentSessionId(null)
  }, [setChatMessages, ai])

  const stopGeneration = useCallback(() => {
    ai.stop()
  }, [ai])

  return { messages: chatMessages, isLoading: ai.isLoading, error, handleSend, handleReset, stopGeneration }
}
