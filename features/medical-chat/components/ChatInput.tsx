"use client"

import { useCallback, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"

interface ChatInputProps {
  onSend: (input: string) => Promise<void>
  isLoading: boolean
  onInsertText?: (text: string) => void
}

export function ChatInput({ onSend, isLoading, onInsertText }: ChatInputProps) {
  const [input, setInput] = useState("")

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    await onSend(trimmed)
    setInput("")
  }, [input, onSend])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        handleSend().catch((err) => console.error("Send message failed", err))
      }
    },
    [handleSend]
  )

  const insertText = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev}\n\n${text}` : text))
  }, [])

  // 暴露 insertText 給父元件
  if (onInsertText) {
    onInsertText(insertText as any)
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your question or instruction…"
        spellCheck={false}
        className="h-[72px] w-full flex-1 resize-none overflow-y-auto"
      />
      <div className="flex items-stretch gap-2 self-end">
        <Button
          onClick={() => handleSend().catch(console.error)}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Send"
          )}
        </Button>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{input.length} characters</span>
      </div>
    </div>
  )
}

/**
 * Input Controller Hook
 * 
 * Provides a way to control text insertion into the chat input from external components.
 * Uses useRef instead of useState for better performance (no re-renders when function changes).
 */
export function useInputController() {
  const insertFnRef = useRef<((text: string) => void) | null>(null)

  const setInsertFn = useCallback((fn: ((text: string) => void) | null) => {
    insertFnRef.current = fn
  }, [])

  const insertText = useCallback((text: string) => {
    if (insertFnRef.current) {
      insertFnRef.current(text)
    }
  }, [])

  return {
    setInsertFn,
    insertText,
  }
}
