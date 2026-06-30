"use client"

import { useEffect, useRef, memo, type ReactNode } from "react"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import { MarkdownRenderer } from "@/src/shared/components/MarkdownRenderer"
import { StreamingIndicator } from "@/src/shared/components/StreamingIndicator"
import { useCopyToClipboard } from "@/src/shared/hooks/use-copy-to-clipboard"
import { markdownToPlainText } from "@/src/shared/utils/markdown-to-text"
import type { ChatMessage } from "@/src/application/stores/chat.store"
import { AgentStateHistory } from "./AgentStateHistory"
import { CollapsibleMessage } from "./CollapsibleMessage"
import { Check, Copy, Sparkles } from "lucide-react"

interface ChatMessageListProps {
  messages: ChatMessage[]
  isLoading: boolean
  /** Rendered at the very bottom of the thread, under the last message (e.g. the
   *  follow-up suggestion chips) — so it scrolls with the conversation like ChatGPT. */
  afterMessages?: ReactNode
  /** Bump to re-trigger the auto-scroll when `afterMessages` content appears/changes
   *  (the [messages] effect alone won't fire, since messages didn't change). */
  scrollSignal?: number
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

const MessageItem = memo(function MessageItem({ message, t }: { message: ChatMessage; t: any }) {
  const { copied, copy } = useCopyToClipboard()

  const handleCopy = async () => {
    const ok = await copy(markdownToPlainText(message.content))
    if (!ok) toast.error(t.common.copyFailed)
  }

  return (
    <div
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
        {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 && (
          <>
            <span>•</span>
            <span className="flex items-center gap-1 text-blue-500">
              <Sparkles className="h-3 w-3" />
              <span className="font-medium">
                {message.toolCalls.includes('searchMedicalLiterature') ? 'Perplexity' : 'FHIR'}
              </span>
            </span>
          </>
        )}
        <span>•</span>
        <span>{formatTimestamp(message.timestamp)}</span>
      </div>
      <div className="flex flex-col gap-2 max-w-[92%] sm:max-w-[85%]">
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
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.images.map((image, idx) => (
                <div
                  key={idx}
                  className="relative rounded-lg overflow-hidden border border-white/20"
                  style={{ maxWidth: '200px', maxHeight: '200px' }}
                >
                  <img
                    src={image.thumbnail || image.data}
                    alt={image.fileName || `Image ${idx + 1}`}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => {
                      // DOM APIs instead of document.write — no HTML-string
                      // interpolation in an app-origin window
                      const win = window.open('about:blank')
                      if (win) {
                        const img = win.document.createElement('img')
                        img.src = image.data
                        img.style.maxWidth = '100%'
                        img.style.height = 'auto'
                        win.document.body.style.margin = '0'
                        win.document.body.style.background = '#000'
                        win.document.body.appendChild(img)
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {message.role === "assistant" ? (
            // MarkdownRenderer renders block-by-block and memoizes each block,
            // so while a reply streams in only the trailing (growing) block is
            // re-parsed — keeping live formatting without freezing the UI on
            // long/fast responses.
            <MarkdownRenderer content={message.content} />
          ) : (
            <CollapsibleMessage content={message.content} />
          )}
        </div>
        {message.role === "assistant" && message.content && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? t.common.copied : t.common.copy}
            className="self-start flex items-center gap-1 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground/70 hover:text-foreground rounded transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-600" />
                {t.common.copied}
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                {t.common.copy}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  return prevProps.message.id === nextProps.message.id && 
         prevProps.message.content === nextProps.message.content &&
         prevProps.message.agentStates?.length === nextProps.message.agentStates?.length
})

export function ChatMessageList({ messages, isLoading, afterMessages, scrollSignal }: ChatMessageListProps) {
  const { t } = useLanguage()
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevMessagesLengthRef = useRef(0)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-scroll with debouncing to prevent blocking during fast streaming
  useEffect(() => {
    // Clear any pending scroll
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    // Debounce scroll updates during streaming (100ms)
    scrollTimeoutRef.current = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
      }
    }, 100)

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [messages, scrollSignal])

  // Track message count for other purposes
  useEffect(() => {
    prevMessagesLengthRef.current = messages.length
  }, [messages.length])

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
            <MessageItem
              key={message.id}
              message={message}
              t={t}
            />
          ))
        )}
        {isLoading ? (
          <StreamingIndicator label={t.common.loading} />
        ) : null}
        {afterMessages}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  )
}
