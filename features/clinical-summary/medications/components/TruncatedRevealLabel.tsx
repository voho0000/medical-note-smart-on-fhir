"use client"

import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/src/shared/utils/cn.utils"

interface TruncatedRevealLabelProps {
  /** Full text — shown truncated, revealed verbatim in the bubble. */
  text: string
  /** Classes for the trigger itself (keeps the caller's density/tone). */
  className?: string
  contentClassName?: string
  "data-testid"?: string
}

/**
 * A one-line label that reveals its full text on tap as well as on hover.
 *
 * `title` is a mouse-only affordance, so a truncated institution name
 * (「示範長青...」) was unreadable on a phone with no way to expand it. This
 * keeps the same visual density but makes the label its own trigger. As in
 * InfoHint, Radix dismisses a tooltip on pointerdown, which would undo the
 * toggle, so a TOUCH pointerdown is preventDefault-ed and the tap opens it;
 * mouse hover still drives Radix normally through onOpenChange.
 *
 * The medication row's expand handler ignores clicks that land on a button, so
 * revealing the label never also toggles the row.
 */
export function TruncatedRevealLabel({
  text,
  className,
  contentClassName,
  "data-testid": testId,
}: TruncatedRevealLabelProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          data-truncated-reveal
          aria-label={text}
          onClick={() => setOpen((previous) => !previous)}
          onPointerDown={(event) => {
            if (event.pointerType === "touch") event.preventDefault()
          }}
          className={cn(
            "rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            className,
          )}
        >
          <span className="truncate">{text}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        className={cn(
          "max-w-[min(90vw,20rem)] whitespace-normal break-words text-xs leading-relaxed",
          contentClassName,
        )}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
