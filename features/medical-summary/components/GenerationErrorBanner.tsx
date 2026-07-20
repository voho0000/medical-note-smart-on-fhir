"use client"

import { useState } from "react"
import type { ComponentProps, ReactNode } from "react"
import { AlertCircle, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface GenerationErrorItem {
  label: string
  message: string
}

export interface GenerationErrorAction {
  label: string
  onClick: () => void
  icon?: ReactNode
  variant?: ComponentProps<typeof Button>["variant"]
}

interface GenerationErrorBannerProps {
  title: string
  errors: GenerationErrorItem[]
  retryLabel: string
  closeLabel: string
  isBusy: boolean
  onRetry: () => void
  actions?: GenerationErrorAction[]
}

/** A dismissible alert for partial failures or an actionable preflight block. */
export function GenerationErrorBanner({
  title,
  errors,
  retryLabel,
  closeLabel,
  isBusy,
  onRetry,
  actions,
}: GenerationErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  const hasActions = Boolean(actions?.length)

  if (dismissed) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          {errors.map((item) => (
            <p key={`${item.label}:${item.message}`} className="mt-0.5 text-xs">
              <span className="font-medium">{item.label}：</span>{item.message}
            </p>
          ))}
        </div>
        {hasActions ? (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {actions?.map((action) => (
              <Button
                key={action.label}
                type="button"
                onClick={action.onClick}
                disabled={isBusy}
                size="sm"
                variant={action.variant ?? "outline"}
                className="h-7 gap-1 px-2 text-xs"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        ) : !isBusy ? (
          <Button
            type="button"
            onClick={onRetry}
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
          >
            <RefreshCw className="h-3 w-3" />
            {retryLabel}
          </Button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={closeLabel}
        title={closeLabel}
        className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-current/70 transition-colors hover:bg-red-100 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-900/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
