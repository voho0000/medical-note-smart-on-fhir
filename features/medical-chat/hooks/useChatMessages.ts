/**
 * Chat Messages Handler Hook
 * 
 * Handles chat message sending logic and state management.
 * Note: Renamed from useChatMessages to avoid confusion with the provider hook.
 */
import { useCallback } from "react"
import { useChatMessages as useChatMessagesProvider, type ChatMessage } from "@/src/application/providers/chat-messages.provider"
import { useUnifiedAi } from "@/src/application/hooks/ai/use-unified-ai.hook"
import { getUserErrorMessage } from "@/src/core/errors"
import { useSendMessage } from "@/src/application/hooks/chat/use-send-message.hook"

export function useChatMessagesHandler(systemPrompt: string, model: string) {
  const { chatMessages, setChatMessages } = useChatMessagesProvider()
  const ai = useUnifiedAi()
  const sendMessage = useSendMessage()

  const handleSend = useCallback(
    async (input: string) => {
      // Use Use Case to validate input
      const validation = sendMessage.validate({
        userMessage: input,
        conversationHistory: chatMessages,
        systemPrompt,
        modelId: model,
      })

      if (!validation.valid) {
        console.warn(`Validation failed: ${validation.error}`)
        return
      }

      // Use Use Case to prepare message send
      const { messages, assistantMessageId } = sendMessage.prepareMessageSend({
        userMessage: input,
        conversationHistory: chatMessages,
        systemPrompt,
        modelId: model,
      })

      // State management: Add user message optimistically
      const userMessage = sendMessage.createMessage("user", input.trim())
      setChatMessages((prev) => [...prev, userMessage])

      try {
        // Call AI with prepared messages
        const result = await ai.query(messages, { modelId: model })
        
        // State management: Add assistant response
        const assistantMessage = sendMessage.createMessage(
          "assistant",
          result || "",
          model
        )
        setChatMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        const errorMessage = getUserErrorMessage(err)
        
        // State management: Add error message
        const errorMsg = sendMessage.createMessage(
          "assistant",
          `❌ ${errorMessage}`
        )
        setChatMessages((prev) => [...prev, errorMsg])
      }
    },
    [chatMessages, model, ai, setChatMessages, systemPrompt, sendMessage]
  )

  const handleReset = useCallback(() => {
    setChatMessages([])
  }, [setChatMessages])

  return {
    messages: chatMessages,
    isLoading: ai.isLoading,
    error: ai.error,
    handleSend,
    handleReset,
  }
}
