// "需要你決定的事" (patient audience: "可以與醫師討論的事") — action items with
// their basis ALWAYS visible in small print, never behind a toggle.
"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  MedicalSummaryResult,
  ResolvedSourceRef,
  SummaryUrgency,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"

const URGENCY_STYLES: Record<SummaryUrgency, { box: string; badge: string }> = {
  high: {
    box: "border-l-red-500 bg-red-50/70 dark:bg-red-950/25",
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  },
  medium: {
    box: "border-l-amber-500 bg-amber-50/70 dark:bg-amber-950/25",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  low: {
    box: "border-l-slate-400 bg-slate-50 dark:bg-slate-900/40",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300",
  },
}

interface DecisionListProps {
  result: MedicalSummaryResult
  title: string
  urgencyLabel: (urgency: SummaryUrgency) => string
  basisLabel: string
  /** Shown as the basis when a decision cites no sources — flags it as an AI
   *  inference rather than pretending it has data behind it. */
  aiInferredLabel: string
  /** Hide urgency badges + rationale codes for the patient audience. */
  showUrgency: boolean
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  showMoreLabel: string
  showLessLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
}

const INITIAL_VISIBLE = 3

export function DecisionList({
  result,
  title,
  urgencyLabel,
  basisLabel,
  aiInferredLabel,
  showUrgency,
  typeLabel,
  unverifiedLabel,
  showMoreLabel,
  showLessLabel,
  onNavigate,
}: DecisionListProps) {
  const [showAll, setShowAll] = useState(false)
  if (result.decisions.length === 0) return null
  const byKey = new Map(result.sourceIndex.map((s) => [s.key, s]))
  const hiddenCount = Math.max(0, result.decisions.length - INITIAL_VISIBLE)
  const visible = showAll ? result.decisions : result.decisions.slice(0, INITIAL_VISIBLE)

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <h3 className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">{title}</h3>
      {/* Card body caps then scrolls (title stays fixed) so a long
          list never dominates the column — see the medical-summary layout doc. */}
      <div className="space-y-1.5">
        {visible.map((d, i) => {
          const style = URGENCY_STYLES[d.urgency]
          const sources = d.sourceKeys
            .map((k) => byKey.get(k))
            .filter((s): s is ResolvedSourceRef => s !== undefined)
          return (
            <div key={i} className={cn("rounded-md border-l-[3px] px-2.5 py-2", style.box)}>
              <div className="flex items-start gap-2">
                {showUrgency ? (
                  <span className={cn("mt-0.5 shrink-0 rounded-md px-1.5 py-px text-[0.625rem] font-bold", style.badge)}>
                    {urgencyLabel(d.urgency)}
                  </span>
                ) : null}
                <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-foreground">{d.text}</p>
              </div>
              <p className="mt-1 text-[0.65rem] leading-snug text-muted-foreground">
                {basisLabel}：{d.rationale?.trim() || aiInferredLabel}
                <SourceSup
                  sources={sources}
                  typeLabel={typeLabel}
                  unverifiedLabel={unverifiedLabel}
                  onNavigate={onNavigate}
                />
              </p>
            </div>
          )
        })}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-2 flex items-center gap-1 text-[0.6875rem] font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300"
          aria-expanded={showAll}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
          {showAll ? showLessLabel : showMoreLabel.replace("{count}", String(hiddenCount))}
        </button>
      ) : null}
    </div>
  )
}
