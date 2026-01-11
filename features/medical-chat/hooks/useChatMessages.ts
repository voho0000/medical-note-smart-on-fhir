import { useCallback } from "react"
import { useNote, type ChatMessage } from "@/src/application/providers/note.provider"
import { useUnifiedAi } from "@/src/application/hooks/ai/use-unified-ai.hook"
import { getUserErrorMessage } from "@/src/core/errors"

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${role}-${Date.now()}`,
    role,
    content,
    timestamp: Date.now(),
  }
}

export function useChatMessages(systemPrompt: string, model: string) {
  const { chatMessages, setChatMessages } = useNote()
  const ai = useUnifiedAi()

  const handleSend = useCallback(
    async (input: string) => {
      const trimmed = input.trim()
      if (!trimmed) return

      const userMessage = createMessage("user", trimmed)
      const optimisticMessages = [...chatMessages, userMessage]
      setChatMessages(optimisticMessages)

      try {
        const gptMessages = [
          { role: "system" as const, content: systemPrompt },
          ...optimisticMessages.map((message) => ({ 
            role: message.role as "user" | "assistant" | "system", 
            content: message.content 
          })),
        ]

        const result = await ai.query(gptMessages, { modelId: model })
        const assistantMessage = {
          ...createMessage("assistant", result || ""),
          modelId: model,
        }
        setChatMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        const errorMessage = getUserErrorMessage(err)
        const errorMsg = createMessage("assistant", `❌ ${errorMessage}`)
        setChatMessages((prev) => [...prev, errorMsg])
      }
    },
    [chatMessages, model, ai, setChatMessages, systemPrompt]
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
