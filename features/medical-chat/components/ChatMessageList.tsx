"use client"

import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"
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

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  
  const timeStr = date.toLocaleTimeString('zh-TW', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  })
  
  if (isToday) {
    return timeStr
  }
  
  const dateStr = date.toLocaleDateString('zh-TW', { 
    month: '2-digit', 
    day: '2-digit' 
  })
  return `${dateStr} ${timeStr}`
}

export function ChatMessageList({ messages, isLoading }: ChatMessageListProps) {
  const { t } = useLanguage()
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
            {t.chat.emptyState}
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
                  "rounded-lg px-3 py-2 text-sm shadow-sm max-w-[90%]",
                  message.role === "assistant" 
                    ? "bg-muted border border-border" 
                    : "bg-primary/10 border border-primary/20 text-foreground",
                )}
              >
                <pre className="whitespace-pre-wrap font-sans text-sm">{message.content}</pre>
              </div>
              <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
                <span className="uppercase tracking-wide">
                  {message.role === "assistant" 
                    ? getModelDisplayName(message.modelId)
                    : message.role === "user" 
                    ? t.chat.you
                    : t.chat.system}
                </span>
                <span>•</span>
                <span>{formatTimestamp(message.timestamp)}</span>
              </div>
            </div>
          ))
        )}
        {isLoading ? (
          <div className="text-xs text-muted-foreground">{t.common.loading}</div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  )
}
