// Chat Input State Management Hook
import { useState, useCallback } from "react"

export function useChatInput() {
  const [input, setInput] = useState("")

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>, onSend: () => Promise<void>, isLoading?: boolean) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        // Prevent double-submit when loading or input is empty
        if (isLoading || !input.trim()) return
        onSend().catch((err) => console.error("Send message failed", err))
      }
    },
    [input]
  )

  const insertText = useCallback((text: string) => {
    if (!text?.trim()) return
    setInput((prev) => (prev ? `${prev}\n\n${text}` : text))
  }, [])

  const insertTextWithTrim = useCallback((text: string) => {
    if (!text?.trim()) return
    setInput((prev) => (prev ? `${prev.trimEnd()}\n\n${text}` : text))
  }, [])

  const clear = useCallback(() => {
    setInput("")
  }, [])

  return {
    input,
    setInput,
    handleKeyDown,
    insertText,
    insertTextWithTrim,
    clear,
  }
}
