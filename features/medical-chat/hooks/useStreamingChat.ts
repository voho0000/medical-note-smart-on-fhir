// Streaming Chat Hook - Clean Architecture Implementation
"use client"

import { useState, useCallback, useRef } from "react"
import { useChatMessages, useSetChatMessages, type ChatMessage, type ChatImage } from "@/src/application/stores/chat.store"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useUnifiedAi } from "@/src/application/hooks/ai/use-unified-ai.hook"
import { useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { gateModelForKeys } from "@/src/shared/constants/ai-models.constants"
import { getUserErrorMessage } from "@/src/core/errors"
import { truncateToContextWindow, getTokenStats, selectMessagesToSend } from "@/src/shared/utils/context-window-manager"
import { addMessagePair } from "@/src/shared/utils/chat-message.utils"
import { useChatHistoryStore } from "@/src/application/stores/chat-history.store"

export function useStreamingChat(
  systemPrompt: string, 
  modelId: string, 
  onInputClear?: () => void,
  onStreamComplete?: () => void
) {
  const chatMessages = useChatMessages()
  const setChatMessages = useSetChatMessages()
  const {} = useLanguage()
  const ai = useUnifiedAi()
  const { apiKey: openAiKey, geminiKey, claudeKey } = useAllApiKeys()
  const [error, setError] = useState<Error | null>(null)
  const hasReceivedChunkRef = useRef(false)

  const handleSend = useCallback(
    async (input: string, images?: ChatImage[]) => {
      hasReceivedChunkRef.current = false
      const trimmed = input.trim()
      if (!trimmed && (!images || images.length === 0)) return

      // Same graceful-degradation gate as deep mode / the stream adapter: when the
      // picked model needs a key we don't have, it actually runs on the free
      // default. Resolve that here so the badge AND the context-window math reflect
      // the model that truly runs — otherwise normal mode shows e.g. "Opus" while
      // really streaming the free model, and sizes the window to the wrong model.
      const effectiveModelId = gateModelForKeys(modelId, { openAiKey, geminiKey, claudeKey })

      // Create user message and assistant placeholder
      const { messages: newMessages, assistantMessageId } = addMessagePair(
        chatMessages,
        trimmed,
        effectiveModelId,
        "", // Empty initial content
        images,
        undefined // agentStates
      )
      setChatMessages(newMessages)

      setError(null)

      // Throttle state for streamed updates. Declared OUTSIDE the try so the
      // catch/finally can clear a still-pending timer — otherwise, after an
      // error the leftover timer fired ~100ms later and overwrote the ❌ error
      // message with the partial stream content.
      let latestContent = ""
      let lastUpdateTime = 0
      let timeoutId: NodeJS.Timeout | null = null
      const UPDATE_INTERVAL = 100 // Update every 100ms to prevent blocking

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
        
        const stats = getTokenStats(messagesForTokenCount, { modelId: effectiveModelId, systemPrompt })

        // Truncate to fit context window
        const truncatedMessages = truncateToContextWindow(messagesForTokenCount, {
          modelId: effectiveModelId,
          systemPrompt,
          maxResponseTokens: 4000
        })

        // Build final messages for API - pass full message objects with images
        // The StreamOrchestrator/Proxy will handle multimodal formatting
        // Map the fitted-message COUNT back onto the original objects (which
        // still carry images). selectMessagesToSend guards the zero case —
        // `slice(-0)` would otherwise send the whole history (see its doc).
        const apiMessages = [
          { role: "system" as const, content: systemPrompt },
          ...selectMessagesToSend(userMessages, truncatedMessages.length)
            .map(m => ({
              role: m.role as "user" | "assistant" | "system",
              content: m.content,
              ...(m.images && m.images.length > 0 && { images: m.images })
            })),
        ]

        // Stream response with throttled updates to prevent main thread blocking
        await ai.stream(apiMessages, {
          modelId: effectiveModelId,
          onChunk: (content: string) => {
            // Clear input on first chunk (streaming started successfully)
            if (!hasReceivedChunkRef.current && onInputClear) {
              hasReceivedChunkRef.current = true
              onInputClear()
            }
            
            // Always store latest content
            latestContent = content
            
            // Throttle updates to prevent main thread blocking during fast streaming
            const now = Date.now()
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
              lastUpdateTime = now
              setChatMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId ? { ...m, content: latestContent } : m)
              )
            } else if (!timeoutId) {
              // Schedule update if not already scheduled
              timeoutId = setTimeout(() => {
                lastUpdateTime = Date.now()
                setChatMessages((prev) =>
                  prev.map((m) => m.id === assistantMessageId ? { ...m, content: latestContent } : m)
                )
                timeoutId = null
              }, UPDATE_INTERVAL - (now - lastUpdateTime))
            }
          },
        })
        
        // Ensure final content is displayed
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantMessageId ? { ...m, content: latestContent } : m)
        )
        
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
      } finally {
        // Kill any still-pending throttled update (abort, error, or completion).
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      }
    },
    [chatMessages, modelId, openAiKey, geminiKey, claudeKey, setChatMessages, systemPrompt, ai, onInputClear, onStreamComplete]
  )

  const handleReset = useCallback(() => {
    ai.stop()
    setChatMessages([])
    // Clear current session ID to start a new conversation
    useChatHistoryStore.getState().setCurrentSessionId(null)
  }, [setChatMessages, ai])

  const stopGeneration = useCallback(() => {
    ai.stop()
  }, [ai])

  return { messages: chatMessages, isLoading: ai.isLoading, error, handleSend, handleReset, stopGeneration }
}
