// Interactive citation superscript — the audit trail moved from an always-
// visible chip row (which ate half the card) into the numbers themselves:
// desktop hovers, touch taps. Reading stays zero-click; auditing is one
// hover/tap away. Unverified citations tint the superscript amber so the
// warning survives even with the chips gone (不遮蔽 principle).
"use client"

import { useRef, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/src/shared/utils/cn.utils"
import type { ResolvedSourceRef } from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"

interface SourceSupProps {
  sources: ResolvedSourceRef[]
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  /** When provided, verified rows become links into the left panel. */
  onNavigate?: (target: ResourceNavTarget) => void
  /** Extra classes for the trigger <sup> (e.g. sizing per host context). */
  className?: string
}

export function SourceSup({ sources, typeLabel, unverifiedLabel, onNavigate, className }: SourceSupProps) {
  const [open, setOpen] = useState(false)
  // Hover uses a small close delay so the pointer can travel into the bubble.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hoverClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }
  // Hover must be MOUSE-only: touch devices (iOS especially) synthesise
  // mouseenter right before the tap's click, so hover-open + click-toggle
  // would open and immediately close the popover on every tap. And once a
  // mouse hover opened it, the follow-up click must not toggle it shut —
  // preventDefault makes Radix skip its toggle (it respects defaultPrevented).
  const lastPointerType = useRef<string>("")
  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") hoverOpen()
  }
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") hoverClose()
  }
  const onPointerDown = (e: React.PointerEvent) => {
    lastPointerType.current = e.pointerType
  }
  const onClick = (e: React.MouseEvent) => {
    if (lastPointerType.current === "mouse" && open) e.preventDefault()
  }
  // <sup role="button"> is not a native button, so Enter/Space don't synthesise
  // a click — without this, keyboard users can't open the citation at all.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      lastPointerType.current = ""
      setOpen((v) => !v)
    }
  }

  if (sources.length === 0) return null
  const hasUnverified = sources.some((s) => !s.verified)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Citation pill, not a bare number — the bordered badge is a widely
            learned "tappable source" affordance (Perplexity-style), which a
            dotted underline alone doesn't communicate on touch screens. */}
        <sup
          role="button"
          tabIndex={0}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onClick={onClick}
          onKeyDown={onKeyDown}
          className={cn(
            // [line-height:…] (not leading-…) — tailwind-merge treats leading-*
            // as conflicting with any text-[size] a host passes via className,
            // which dropped this and collapsed the pill to a 0-height line
            // (preflight gives <sup> line-height:0). Arbitrary properties are
            // immune to that conflict group.
            "ml-0.5 inline-flex cursor-pointer select-none items-center rounded-full border px-1 text-[0.6rem] font-bold [line-height:1.15rem] align-super",
            "touch-manipulation transition-transform active:scale-90",
            hasUnverified
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600/60 dark:bg-amber-950/50 dark:text-amber-300"
              : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20",
            className,
          )}
        >
          {sources.map((s) => s.num).join(",")}
        </sup>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        // Sized to its lines, not the default w-72; keep it a compact bubble.
        className="w-auto max-w-[280px] space-y-1 px-3 py-2"
      >
        {sources.map((s) =>
          // Verified rows navigate the left panel to the raw resource; the ↗
          // affordance marks them as links. Unverified rows have no resource
          // to go to — plain amber text, deliberately inert.
          s.verified && s.resourceId && onNavigate ? (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setOpen(false)
                onNavigate({
                  resourceType: s.resourceType ?? "",
                  resourceId: s.resourceId!,
                  display: s.display,
                  date: s.date,
                })
              }}
              className="group flex w-full items-baseline gap-1.5 rounded-sm px-1 py-0.5 -mx-1 text-left text-[0.7rem] leading-snug tabular-nums text-muted-foreground transition-colors hover:bg-violet-50 hover:text-foreground dark:hover:bg-violet-500/10"
            >
              <b className="shrink-0 font-bold text-violet-600 dark:text-violet-400">{s.num}</b>
              <span className="min-w-0 flex-1">
                {typeLabel(s.resourceType)}
                {s.organization ? <> · {s.organization}</> : null}
                {s.date ? <> · {s.date}</> : null}
                {s.display ? <span className="block text-foreground/80">{s.display}</span> : null}
              </span>
              <ArrowUpRight className="h-3 w-3 shrink-0 self-center text-violet-400 opacity-60 transition-opacity group-hover:opacity-100" />
            </button>
          ) : (
            <p
              key={s.key}
              className={cn(
                "flex items-baseline gap-1.5 text-[0.7rem] leading-snug tabular-nums",
                s.verified ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300",
              )}
            >
              <b className="shrink-0 font-bold text-violet-600 dark:text-violet-400">{s.num}</b>
              <span className="min-w-0">
                {s.verified ? (
                  <>
                    {typeLabel(s.resourceType)}
                    {s.organization ? <> · {s.organization}</> : null}
                    {s.date ? <> · {s.date}</> : null}
                    {s.display ? (
                      <span className="block text-foreground/80">{s.display}</span>
                    ) : null}
                  </>
                ) : (
                  <>
                    {s.key} · {unverifiedLabel}
                  </>
                )}
              </span>
            </p>
          ),
        )}
      </PopoverContent>
    </Popover>
  )
}
