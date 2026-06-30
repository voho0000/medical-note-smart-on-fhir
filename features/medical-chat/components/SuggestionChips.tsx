"use client"

import { Sparkles } from "lucide-react"
import type { FollowupSuggestion } from "@/src/core/use-cases/chat/generate-followup-suggestions.use-case"

interface SuggestionChipsProps {
  suggestions: FollowupSuggestion[]
  onPick: (prompt: string) => void
  disabled?: boolean
}

/**
 * "Next step" chips shown above the chat input after an answer completes.
 * Clicking a chip sends its full prompt as the next message.
 */
export function SuggestionChips({ suggestions, onPick, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-2">
      {suggestions.map((s, i) => (
        <button
          key={`${i}-${s.label}`}
          type="button"
          disabled={disabled}
          onClick={() => onPick(s.prompt)}
          title={s.prompt}
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="h-3 w-3 shrink-0 opacity-60" />
          <span className="line-clamp-1 text-left">{s.label}</span>
        </button>
      ))}
    </div>
  )
}
