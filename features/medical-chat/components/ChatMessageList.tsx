"use client"

import { useEffect, useRef } from "react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import type { ChatMessage } from "@/src/application/providers/note.provider"
import { AgentStateHistory } from "./AgentStateHistory"

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
    <ScrollArea className="h-full px-4 py-4">
      <div className="flex flex-col gap-4 min-h-full justify-end">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="text-4xl mb-3 opacity-20">💬</div>
            <div className="text-sm text-muted-foreground">
              {t.chat.emptyState}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-1.5",
                message.role === "assistant" ? "items-start" : "items-end",
              )}
            >
              <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground px-1">
                <span className="font-medium uppercase tracking-wide">
                  {message.role === "assistant" 
                    ? getModelDisplayName(message.modelId)
                    : message.role === "user" 
                    ? t.chat.you
                    : t.chat.system}
                </span>
                <span>•</span>
                <span>{formatTimestamp(message.timestamp)}</span>
              </div>
              <div className="flex flex-col gap-2 max-w-[85%]">
                {message.role === "assistant" && message.agentStates && message.agentStates.length > 1 && (
                  <AgentStateHistory 
                    states={message.agentStates} 
                    currentState={message.content}
                  />
                )}
                <div
                  className={cn(
                    "relative px-4 py-2.5 text-sm break-words",
                    message.role === "assistant" 
                      ? "rounded-2xl rounded-tl-sm bg-muted/80 text-foreground shadow-sm" 
                      : "rounded-2xl rounded-tr-sm bg-blue-500 text-white shadow-md",
                  )}
                >
                  {message.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({node, ...props}) => <h1 className="text-lg font-bold border-b pb-1 mb-2" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-base font-bold mt-4 mb-2" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-sm font-semibold mt-3 mb-1" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
                        li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                        p: ({node, ...props}) => <p className="leading-relaxed" {...props} />,
                        a: ({node, ...props}) => (
                          <a 
                            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            {...props} 
                          />
                        ),
                        code: ({node, inline, ...props}: any) => 
                          inline ? (
                            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props} />
                          ) : (
                            <code className="block bg-muted p-2 rounded text-xs font-mono overflow-x-auto" {...props} />
                          ),
                        strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                        em: ({node, ...props}) => <em className="italic" {...props} />,
                        hr: ({node, ...props}) => <hr className="my-3 border-border" {...props} />,
                        blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-muted-foreground/30 pl-3 italic my-2" {...props} />,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{message.content}</pre>
                  )}
                </div>
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
