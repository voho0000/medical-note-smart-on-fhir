"use client"

import { useEffect, useRef } from "react"
import {
  ChartNoAxesCombined,
  ClipboardCheck,
  Clock3,
  ListChecks,
  Pill,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type { MedicalSummaryCardId } from "../hooks/useMedicalSummaryCardLayout"

export interface MedicalSummaryCardNavItem {
  id: MedicalSummaryCardId
  label: string
  description?: string
  count?: number
}

interface MedicalSummaryCardNavProps {
  items: MedicalSummaryCardNavItem[]
  ariaLabel: string
  activeId?: MedicalSummaryCardId
  onJump: (id: MedicalSummaryCardId) => void
}

const CARD_ICON: Record<MedicalSummaryCardId, { icon: LucideIcon; className: string }> = {
  problems: { icon: ListChecks, className: "text-violet-500" },
  timeline: { icon: Clock3, className: "text-teal-500" },
  safety: { icon: ShieldAlert, className: "text-blue-500" },
  decisions: { icon: ClipboardCheck, className: "text-amber-500" },
  investigations: { icon: ChartNoAxesCombined, className: "text-cyan-600 dark:text-cyan-400" },
  medications: { icon: Pill, className: "text-emerald-600 dark:text-emerald-400" },
}

const CHIP_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:hover:border-teal-500/40 dark:hover:bg-teal-950/20"

const ACTIVE_CHIP_CLASS =
  "border-teal-500/60 bg-teal-50 text-teal-800 ring-1 ring-teal-500/10 hover:border-teal-500/70 hover:bg-teal-100/70 hover:text-teal-900 dark:border-teal-500/50 dark:bg-teal-950/60 dark:text-teal-100 dark:hover:bg-teal-950/80 dark:hover:text-teal-50"

/**
 * Optional accelerator for the long structured-summary page. Its input is the
 * already ordered/visible card list, so layout customisation and this jump bar
 * cannot drift apart as cards are hidden, restored, or reordered.
 */
export function MedicalSummaryCardNav({
  items,
  ariaLabel,
  activeId,
  onJump,
}: MedicalSummaryCardNavProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<Partial<Record<MedicalSummaryCardId, HTMLButtonElement | null>>>({})

  // On narrow panels, keep the highlighted chip inside the horizontal
  // viewport as vertical scrolling advances through cards farther to the right.
  useEffect(() => {
    if (!activeId) return
    const scroller = scrollerRef.current
    const chip = chipRefs.current[activeId]
    if (!scroller || !chip) return

    const scrollerRect = scroller.getBoundingClientRect()
    const chipRect = chip.getBoundingClientRect()
    const edgeInset = 8
    const delta = chipRect.left < scrollerRect.left + edgeInset
      ? chipRect.left - scrollerRect.left - edgeInset
      : chipRect.right > scrollerRect.right - edgeInset
        ? chipRect.right - scrollerRect.right + edgeInset
        : 0
    if (delta === 0) return

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const nextScrollLeft = scroller.scrollLeft + delta
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({
        left: nextScrollLeft,
        behavior: reduceMotion ? "auto" : "smooth",
      })
    } else {
      scroller.scrollLeft = nextScrollLeft
    }
  }, [activeId])

  if (items.length === 0) return null

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-0 z-20 -mx-1 border-y border-border/60 bg-background/95 py-1.5 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-background/80"
    >
      <div
        ref={scrollerRef}
        data-testid="medical-summary-card-nav-scroller"
        className="overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-w-max items-center gap-1.5">
          {items.map((item) => {
            const isActive = item.id === activeId
            const { icon: Icon, className: iconClassName } = CARD_ICON[item.id]
            return (
              <button
                key={item.id}
                ref={(node) => { chipRefs.current[item.id] = node }}
                type="button"
                className={cn(CHIP_CLASS, isActive && ACTIVE_CHIP_CLASS)}
                title={item.description}
                aria-controls={`medical-summary-card-${item.id}`}
                aria-current={isActive ? "location" : undefined}
                onClick={() => onJump(item.id)}
              >
                <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${iconClassName}`} />
                <span>{item.label}</span>
                {item.count !== undefined ? (
                  <span className={cn(
                    "font-semibold tabular-nums",
                    isActive ? "text-teal-900 dark:text-teal-50" : "text-foreground",
                  )}>
                    {item.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
