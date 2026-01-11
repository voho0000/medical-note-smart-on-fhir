"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { AgentState } from "@/src/application/providers/chat-messages.provider"

interface AgentStateHistoryProps {
  states: AgentState[]
  currentState: string
}

function formatStateTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-TW', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false 
  })
}

export function AgentStateHistory({ states, currentState }: AgentStateHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!states || states.length <= 1) {
    return null
  }

  const previousStates = states.slice(0, -1)

  return (
    <div className="mb-3 border border-muted rounded-lg overflow-hidden bg-muted/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span>思考過程 ({states.length} 個步驟)</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">
          {isExpanded ? '收起' : '展開查看'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="border-t border-muted">
          <div className="px-3 py-2 space-y-2 max-h-[300px] overflow-y-auto">
            {previousStates.map((state, index) => (
              <div 
                key={index}
                className="flex items-start gap-2 text-xs pb-2 border-b border-muted/50 last:border-0"
              >
                <span className="text-[10px] text-muted-foreground/60 mt-0.5 shrink-0 font-mono">
                  {formatStateTimestamp(state.timestamp)}
                </span>
                <span className="text-muted-foreground/80 flex-1">
                  {state.state}
                </span>
              </div>
            ))}
            <div className="flex items-start gap-2 text-xs pt-1">
              <span className="text-[10px] text-primary/60 mt-0.5 shrink-0 font-mono">
                {formatStateTimestamp(states[states.length - 1].timestamp)}
              </span>
              <span className="text-primary font-medium flex-1">
                {currentState}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
