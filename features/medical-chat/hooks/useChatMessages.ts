import { useCallback, useMemo } from "react"
import { useNote, type ChatMessage } from "@/src/application/providers/note.provider"
import { useAiQuery } from "@/src/application/hooks/use-ai-query.hook"
import { useApiKey } from "@/src/application/providers/api-key.provider"

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
  const { apiKey: openAiKey, geminiKey } = useApiKey()
  const { queryAi, isLoading, error } = useAiQuery(openAiKey, geminiKey)

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
          ...optimisticMessages.map((message) => ({ role: message.role, content: message.content })),
        ]

        const result = await queryAi(gptMessages, model)
        const assistantMessage = {
          ...createMessage("assistant", result.text || ""),
          modelId: model,
        }
        setChatMessages((prev) => [...prev, assistantMessage])
      } catch (err) {
        const fallback = err instanceof Error ? err.message : "Failed to generate response."
        const errorMessage = createMessage("assistant", `⚠️ ${fallback}`)
        setChatMessages((prev) => [...prev, errorMessage])
      }
    },
    [chatMessages, model, queryAi, setChatMessages, systemPrompt]
  )

  const handleReset = useCallback(() => {
    setChatMessages([])
  }, [setChatMessages])

  return {
    messages: chatMessages,
    isLoading,
    error,
    handleSend,
    handleReset,
  }
}
