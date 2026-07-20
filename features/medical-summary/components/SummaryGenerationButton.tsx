"use client"

import { Database, Loader2, RefreshCw, Sparkles, Square } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SummaryGenerationButtonProps {
  isBusy: boolean
  isStopping: boolean
  isRestoring: boolean
  hasContextOverflow: boolean
  hasAnyResult: boolean
  labels: {
    generate: string
    regenerate: string
    stop: string
    stopping: string
    resolveOverflow: string
  }
  onGenerate: () => void
  onStop: () => void
  onResolveOverflow: () => void
}

export function getSummaryGenerationActivityState({
  isBusy,
  hasContextOverflow,
  hasCompleteResult = false,
}: {
  isBusy: boolean
  hasContextOverflow: boolean
  hasCompleteResult?: boolean
}) {
  const actionBusy = isBusy && !hasContextOverflow
  return {
    actionBusy,
    showBlockingLoader: actionBusy && !hasCompleteResult,
    showGenerationErrors: !isBusy || hasContextOverflow,
  }
}

/**
 * One primary action for summary generation.
 *
 * An overflow is already an actionable preflight result, even when the other
 * independent pipeline is still finishing. It must therefore take visual and
 * interaction priority over that pipeline's busy state.
 */
export function SummaryGenerationButton({
  isBusy,
  isStopping,
  isRestoring,
  hasContextOverflow,
  hasAnyResult,
  labels,
  onGenerate,
  onStop,
  onResolveOverflow,
}: SummaryGenerationButtonProps) {
  // Keep overflow content/actions visible elsewhere, but the single header
  // button must remain an escape hatch while either pipeline is still active.
  const stopAvailable = isBusy
  const label = isStopping
    ? labels.stopping
    : stopAvailable
      ? labels.stop
      : hasContextOverflow
        ? labels.resolveOverflow
        : hasAnyResult
          ? labels.regenerate
          : labels.generate

  return (
    <Button
      type="button"
      onClick={stopAvailable ? onStop : hasContextOverflow ? onResolveOverflow : onGenerate}
      size="sm"
      variant="outline"
      className={stopAvailable || isStopping
        ? "h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        : "h-7 gap-1 px-2 text-xs"}
      disabled={isStopping || (!stopAvailable && isRestoring)}
      title={label}
      aria-label={label}
      aria-busy={isStopping || undefined}
    >
      {isStopping ? (
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
      ) : stopAvailable ? (
        <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
      ) : hasContextOverflow ? (
        <Database aria-hidden="true" className="h-3.5 w-3.5" />
      ) : hasAnyResult ? (
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  )
}
