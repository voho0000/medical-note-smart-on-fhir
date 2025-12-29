"use client"

import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/src/shared/utils/cn.utils"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import type { ChatMessage } from "@/src/application/providers/note.provider"

interface ChatMessageListProps {
  messages: ChatMessage[]
  isLoading: boolean
}

function getModelDisplayName(modelId?: string): string {
  if (!modelId) return "AI"
  const modelDef = getModelDefinition(modelId)
  return modelDef?.label || modelId
}

export function ChatMessageList({ messages, isLoading }: ChatMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevMessagesLengthRef = useRef(0)

  useEffect(() => {
    // Only scroll to bottom when new messages are added, not on initial mount
    if (messages.length > prevMessagesLengthRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
    prevMessagesLengthRef.current = messages.length
  }, [messages, isLoading])

  return (
    <ScrollArea className="h-[390px] px-4">
      <div className="flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Ask follow-up questions or draft sections of the medical note. You can insert clinical context or dictate notes with the microphone.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-1",
                message.role === "assistant" ? "items-start" : "items-end",
              )}
            >
              <div
                className={cn(
                  "rounded-md px-3 py-2 text-sm shadow-sm",
                  message.role === "assistant" ? "bg-muted" : "bg-primary text-primary-foreground",
                )}
              >
                <pre className="whitespace-pre-wrap font-sans text-sm">{message.content}</pre>
              </div>
              <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                {message.role === "assistant" 
                  ? getModelDisplayName(message.modelId)
                  : message.role === "user" 
                  ? "You" 
                  : "System"}
              </span>
            </div>
          ))
        )}
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Generating response…</div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  )
}
