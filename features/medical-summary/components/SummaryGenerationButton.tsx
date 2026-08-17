"use client"

import { Database, Loader2, RefreshCw, Sparkles, Square } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SummaryGenerationButtonProps {
  presentation?: "toolbar" | "empty"
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
  hasAnyResult = false,
}: {
  isBusy: boolean
  hasContextOverflow: boolean
  /** A validated partial card is already presentable. Keep the blocking loader
   * only until that first card arrives; remaining cards may stream or retry
   * without hiding successful work. */
  hasAnyResult?: boolean
}) {
  const actionBusy = isBusy && !hasContextOverflow
  return {
    actionBusy,
    showBlockingLoader: actionBusy && !hasAnyResult,
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
  presentation = "toolbar",
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
  const isEmptyStateAction = presentation === "empty"
  const isStopAction = stopAvailable || isStopping
  const iconClassName = isEmptyStateAction ? "size-5" : "h-3.5 w-3.5"

  return (
    <Button
      type="button"
      onClick={stopAvailable ? onStop : hasContextOverflow ? onResolveOverflow : onGenerate}
      size={isEmptyStateAction ? "lg" : "sm"}
      variant="outline"
      className={isEmptyStateAction
        ? isStopAction
          ? "min-h-12 min-w-44 gap-2 px-7 text-base text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive hover:shadow-none sm:min-h-14"
          : "min-h-12 min-w-44 gap-2 bg-secondary px-7 text-base text-secondary-foreground shadow-none hover:bg-accent hover:text-accent-foreground hover:shadow-none sm:min-h-14 dark:bg-secondary dark:text-secondary-foreground dark:hover:bg-accent dark:hover:text-accent-foreground"
        : isStopAction
          ? "h-[44px] shrink-0 gap-1 px-2 text-xs text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive hover:shadow-none lg:h-7 @max-[36rem]:h-10 @max-[36rem]:w-10 @max-[36rem]:justify-center @max-[36rem]:px-0"
          : "h-[44px] shrink-0 gap-1 px-2 text-xs shadow-none hover:shadow-none lg:h-7 @max-[36rem]:h-10 @max-[36rem]:w-10 @max-[36rem]:justify-center @max-[36rem]:px-0"}
      disabled={isStopping || (!stopAvailable && isRestoring)}
      data-testid={isEmptyStateAction ? "medical-summary-empty-generate" : undefined}
      title={label}
      aria-label={label}
      aria-busy={isStopping || undefined}
    >
      {isStopping ? (
        <Loader2 aria-hidden="true" className={`${iconClassName} animate-spin`} />
      ) : stopAvailable ? (
        <Square aria-hidden="true" className={`${iconClassName} fill-current`} />
      ) : hasContextOverflow ? (
        <Database aria-hidden="true" className={iconClassName} />
      ) : hasAnyResult ? (
        <RefreshCw aria-hidden="true" className={iconClassName} />
      ) : (
        <Sparkles aria-hidden="true" className={iconClassName} />
      )}
      <span className={isEmptyStateAction ? undefined : "@max-[36rem]:hidden"}>{label}</span>
    </Button>
  )
}
