"use client"

import { ModelExecutionNotice } from '@/src/shared/components/ModelExecutionNotice'
import { modelExecutionFallback } from '@/src/shared/utils/ai-model-execution'
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
import type { MedicalSummaryGenerationInfo } from "../utils/summary-generation-info"
import {
  SummaryGenerationMeta,
  type ActiveSummaryGeneration,
} from "./SummaryGenerationMeta"

export interface MedicalSummaryCardNavItem {
  id: MedicalSummaryCardId
  label: string
  compactLabel?: string
  description?: string
  count?: number
}

interface MedicalSummaryCardNavProps {
  items: MedicalSummaryCardNavItem[]
  ariaLabel: string
  activeId?: MedicalSummaryCardId
  onJump: (id: MedicalSummaryCardId) => void
  generationInfo?: MedicalSummaryGenerationInfo
  activeGeneration?: ActiveSummaryGeneration | null
  runningLabel?: string
  runningAriaTemplate?: string
}

const CARD_ICON: Record<MedicalSummaryCardId, { icon: LucideIcon; className: string }> = {
  problems: { icon: ListChecks, className: "text-muted-foreground" },
  timeline: { icon: Clock3, className: "text-muted-foreground" },
  safety: { icon: ShieldAlert, className: "text-muted-foreground" },
  decisions: { icon: ClipboardCheck, className: "text-muted-foreground" },
  investigations: { icon: ChartNoAxesCombined, className: "text-muted-foreground" },
  medications: { icon: Pill, className: "text-muted-foreground" },
}

const CHIP_CLASS =
  "inline-flex min-h-[44px] shrink-0 items-center gap-[clamp(2px,calc(0.8cqw-1px),4px)] rounded-sm border-0 bg-transparent px-[clamp(0px,calc(1.5cqw-3px),8px)] py-1 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:min-h-8"

const ACTIVE_CHIP_CLASS =
  "bg-muted text-primary hover:bg-muted hover:text-primary"

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
  generationInfo,
  activeGeneration,
  runningLabel = "Generating",
  runningAriaTemplate = "Generating with {model}; elapsed {elapsed}",
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
      data-tour="medical-summary-card-nav"
      className="sticky top-0 z-20 -mx-1 border-y border-border/60 bg-background py-1.5"
    >
      <div className="flex min-w-0 flex-nowrap items-center gap-[clamp(4px,0.8cqw,6px)] px-1">
        <div
          ref={scrollerRef}
          data-testid="medical-summary-card-nav-scroller"
          className="min-w-0 max-w-full flex-none overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex min-w-max items-center gap-[clamp(2px,0.6cqw,4px)]">
            {items.map((item) => {
              const isActive = item.id === activeId
              const { icon: Icon, className: iconClassName } = CARD_ICON[item.id]
              const accessibleLabel = item.count === undefined
                ? item.label
                : `${item.label} ${item.count}`
              return (
                <button
                  key={item.id}
                  ref={(node) => { chipRefs.current[item.id] = node }}
                  type="button"
                  className={cn(CHIP_CLASS, isActive && ACTIVE_CHIP_CLASS)}
                  title={item.description}
                  aria-label={accessibleLabel}
                  aria-controls={`medical-summary-card-${item.id}`}
                  aria-current={isActive ? "location" : undefined}
                  onClick={() => onJump(item.id)}
                >
                  <Icon aria-hidden="true" className={`h-3.5 w-3.5 @max-[28rem]:hidden ${iconClassName}`} />
                  <span>{item.compactLabel ?? item.label}</span>
                  {item.count !== undefined ? (
                    <span className={cn(
                      "font-semibold tabular-nums",
                      isActive ? "text-primary" : "text-foreground",
                    )}>
                      {item.count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
        <SummaryGenerationMeta
          generationInfo={generationInfo}
          activeGeneration={activeGeneration}
          runningLabel={runningLabel}
          runningAriaTemplate={runningAriaTemplate}
          className="ml-auto min-w-0 max-w-[min(48%,24rem)] flex-1 justify-end text-xs"
        />
      </div>
      {!activeGeneration && generationInfo?.modelExecution && modelExecutionFallback(generationInfo.modelExecution) && (
        <div className="px-3 pb-2"><ModelExecutionNotice execution={generationInfo.modelExecution} /></div>
      )}
    </nav>
  )
}
