// Streaming Chat Hook - Clean Architecture Implementation
"use client"

import { useState, useCallback, useRef } from "react"
import { useChatMessages, useSetChatMessages, type ChatMessage, type ChatImage } from "@/src/application/stores/chat.store"
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
    async (input: string, images?: ChatImage[]) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed && (!images || images.length === 0)) return

      // Create user message and assistant placeholder
      const { messages: newMessages, assistantMessageId } = addMessagePair(
        chatMessages,
        trimmed,
        modelId,
        "", // Empty initial content
        images,
        undefined // agentStates
      )
      setChatMessages(newMessages)

      setError(null)

      try {
        // Prepare messages (exclude the empty assistant placeholder)
        const userMessages = newMessages
          .filter(m => m.id !== assistantMessageId)
        
        // Check token usage and truncate if needed (use text-only for counting)
        const messagesForTokenCount = userMessages.map((m) => {
          let content = m.content
          if (m.images && m.images.length > 0) {
            content = `${m.content}\n[${m.images.length} image${m.images.length > 1 ? 's' : ''} attached]`
          }
          return { role: m.role, content }
        })
        
        const stats = getTokenStats(messagesForTokenCount, { modelId, systemPrompt })
        
        // Truncate to fit context window
        const truncatedMessages = truncateToContextWindow(messagesForTokenCount, { 
          modelId, 
          systemPrompt,
          maxResponseTokens: 4000 
        })

        // Build final messages for API - pass full message objects with images
        // The StreamOrchestrator/Proxy will handle multimodal formatting
        const apiMessages = [
          { role: "system" as const, content: systemPrompt },
          ...userMessages
            .slice(-truncatedMessages.length)
            .map(m => ({
              role: m.role as "user" | "assistant" | "system",
              content: m.content,
              ...(m.images && m.images.length > 0 && { images: m.images })
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
        if (onStreamComplete) {
          try {
            await onStreamComplete()
          } catch (error) {
            console.error('[Streaming] onStreamComplete callback failed:', error)
          }
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
