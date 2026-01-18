// Chat Input State Management Hook
import { useState, useCallback } from "react"

export function useChatInput() {
  const [input, setInput] = useState("")

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>, onSend: () => Promise<void>, isLoading?: boolean, disabled?: boolean) => {
      // Skip if IME is composing (e.g., Chinese/Japanese input methods)
      // This prevents sending message when user presses Enter to confirm IME input
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        // Prevent double-submit when loading, input is empty, or disabled
        if (isLoading || !input.trim() || disabled) return
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
