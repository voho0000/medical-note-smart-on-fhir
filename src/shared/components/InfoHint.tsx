"use client"

import * as React from "react"
import { Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/src/shared/utils/cn.utils"

interface InfoHintProps {
  /** Help content shown in the bubble. */
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  /** Extra classes for the ⓘ trigger button. */
  className?: string
  /** Extra classes for the bubble (e.g. max-w-xs). */
  contentClassName?: string
  /** Trigger icon size — defaults to h-3.5 w-3.5. */
  iconClassName?: string
  "aria-label"?: string
}

/**
 * An ⓘ help affordance that works on BOTH mouse and touch.
 *
 * A plain Radix tooltip only opens on hover/focus, so on phones and tablets the
 * help text is unreachable (no hover, and Radix dismisses on pointerdown). This
 * wraps the same Radix tooltip (so positioning + body-portal are correct, no
 * clipping inside overflow-hidden cards) but drives `open` ourselves: hover
 * still opens it on desktop (via onOpenChange), and a tap toggles it on touch —
 * we preventDefault the touch pointerdown so Radix doesn't eat the tap before
 * our toggle runs. Outside-tap / Escape close it through Radix's own handling.
 *
 * Use for the pure ⓘ help icons; leave action-button tooltips as plain Tooltip
 * (the user taps the button itself there).
 */
export function InfoHint({
  children,
  side = "top",
  className,
  contentClassName,
  iconClassName,
  "aria-label": ariaLabel,
}: InfoHintProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen} delayDuration={150}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel ?? "說明"}
            onClick={() => setOpen((o) => !o)}
            onPointerDown={(e) => {
              // Touch: Radix closes the tooltip on pointerdown, which would
              // immediately undo our onClick toggle. Stop it so the tap opens.
              if (e.pointerType === "touch") e.preventDefault()
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              className,
            )}
          >
            <Info className={cn("h-3.5 w-3.5", iconClassName)} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className={cn("max-w-xs", contentClassName)}>
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
