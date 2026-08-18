"use client"

import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/src/shared/utils/cn.utils"

interface TapTooltipProps {
  /** The essential text the bubble must expose (full lab value, institution
   *  name, drug master record…). */
  content: React.ReactNode
  /** Visible trigger content. Wrapped in a focusable span unless `asChild`. */
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  /** Classes for the built-in span trigger (ignored when `asChild`). */
  className?: string
  contentClassName?: string
  /** Test hook on the bubble itself (callers assert its surface classes). */
  contentTestId?: string
  "aria-label"?: string
  /** Render `children` itself as the trigger (Radix asChild) instead of
   *  wrapping it. Use when an extra span would break the host's flex layout;
   *  the child must then carry its own `tabIndex` to stay keyboard reachable. */
  asChild?: boolean
  /** Default true: a tap that reveals hidden text must not ALSO toggle the row
   *  or accordion behind it. */
  stopPropagation?: boolean
}

/**
 * A Radix tooltip that also opens on TAP.
 *
 * Radix tooltips are hover/focus-only. That is fine for decoration, but several
 * tooltips in the clinical panels carry information that exists NOWHERE else —
 * the untruncated lab value, the full institution name, the NHI drug master
 * record. On an iPad those are simply unreachable.
 *
 * Same technique as InfoHint: drive `open` ourselves so hover still works on
 * desktop (Radix reports it through onOpenChange), and handle touch explicitly.
 * On a touch pointerdown we toggle and preventDefault, which both suppresses
 * Radix's own "close on pointerdown" (it composes our handler first and skips
 * its own once the event is default-prevented) and makes the toggle survive the
 * tap. The click that may follow the same tap is ignored, so one tap = one
 * toggle either way. Outside-tap and Escape close it through Radix.
 *
 * For an icon-only ⓘ affordance use InfoHint instead; this is for the cases
 * where the truncated text itself must stay the trigger.
 */
export function TapTooltip({
  content,
  children,
  side = "top",
  sideOffset,
  className,
  contentClassName,
  contentTestId,
  "aria-label": ariaLabel,
  asChild = false,
  stopPropagation = true,
}: TapTooltipProps) {
  const [open, setOpen] = React.useState(false)
  // Remembers whether the pending click came from a finger, so the tap is not
  // counted twice when the browser also dispatches a compatibility click.
  const lastPointerTypeRef = React.useRef<string>("")

  const handlePointerDown = (event: React.PointerEvent) => {
    lastPointerTypeRef.current = event.pointerType
    if (event.pointerType !== "touch") return
    event.preventDefault()
    if (stopPropagation) event.stopPropagation()
    setOpen((current) => !current)
  }

  const handleClick = (event: React.MouseEvent) => {
    if (stopPropagation) event.stopPropagation()
    // Radix closes on click (`composeEventHandlers(props.onClick, onClose)`),
    // which would slam the bubble shut in the same tap that opened it. Our
    // handler runs first, so default-preventing it hands the open/closed
    // decision entirely to the state below. The trigger is a span in every
    // caller, so there is no navigation/submit default to lose.
    event.preventDefault()
    if (lastPointerTypeRef.current === "touch") {
      lastPointerTypeRef.current = ""
      return
    }
    setOpen((current) => !current)
  }

  const trigger = asChild ? (
    children
  ) : (
    <span
      // Focusable (the plain Radix trigger span was not), so the same content
      // is reachable by keyboard as well as by hover and tap.
      tabIndex={0}
      aria-label={ariaLabel}
      className={cn("touch-manipulation cursor-pointer", className)}
    >
      {children}
    </span>
  )

  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={150}>
      <TooltipTrigger asChild onPointerDown={handlePointerDown} onClick={handleClick}>
        {trigger}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        className={contentClassName}
        data-testid={contentTestId}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
