"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"

interface CollapsibleMessageProps {
  content: string
  maxLines?: number
  maxChars?: number
  className?: string
}

export function CollapsibleMessage({ 
  content, 
  maxLines = 5, 
  maxChars = 500,
  className 
}: CollapsibleMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Check if message is long enough to collapse
  const isLongMessage = content.length > maxChars || content.split('\n').length > maxLines
  
  if (!isLongMessage) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {content}
      </pre>
    )
  }
  
  return (
    <div className="flex flex-col gap-2">
      <pre 
        className={cn(
          "whitespace-pre-wrap font-sans text-sm leading-relaxed transition-all duration-300",
          !isExpanded && "line-clamp-5",
          className
        )}
      >
        {content}
      </pre>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors self-start"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-3 w-3" />
            <span>收起</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" />
            <span>展開更多</span>
          </>
        )}
      </button>
    </div>
  )
}
