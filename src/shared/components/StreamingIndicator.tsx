// A small animated "AI is working" indicator for streaming responses — three
// staggered bouncing dots + a pulsing sparkle, so the wait reads as ACTIVE
// (replaces the static "載入中" text, which felt frozen). Pure CSS animation
// (Tailwind animate-bounce / animate-pulse), no JS timers.
import { Sparkles } from "lucide-react"

export function StreamingIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground" role="status" aria-live="polite">
      <Sparkles className="h-3.5 w-3.5 text-blue-500 animate-pulse" aria-hidden="true" />
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500/80 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500/80 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500/80 animate-bounce" />
      </span>
      {label ? <span>{label}</span> : null}
    </div>
  )
}
