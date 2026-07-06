// "需要你決定的事" (patient audience: "可以與醫師討論的事") — action items with
// their basis ALWAYS visible in small print, never behind a toggle.
"use client"

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
  onNavigate?: (target: ResourceNavTarget) => void
}

export function DecisionList({
  result,
  title,
  urgencyLabel,
  basisLabel,
  aiInferredLabel,
  showUrgency,
  typeLabel,
  unverifiedLabel,
  onNavigate,
}: DecisionListProps) {
  if (result.decisions.length === 0) return null
  const byKey = new Map(result.sourceIndex.map((s) => [s.key, s]))

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground">{title}</h3>
      {/* Card body caps at 30rem then scrolls (title stays fixed) so a long
          list never dominates the column — see the medical-summary layout doc. */}
      <div className="max-h-[30rem] space-y-2 overflow-y-auto scrollbar-thin-persistent">
        {result.decisions.map((d, i) => {
          const style = URGENCY_STYLES[d.urgency]
          const sources = d.sourceKeys
            .map((k) => byKey.get(k))
            .filter((s): s is ResolvedSourceRef => s !== undefined)
          return (
            <div key={i} className={cn("rounded-lg border-l-[3px] px-3 py-2.5", style.box)}>
              <div className="flex items-start gap-2">
                {showUrgency ? (
                  <span className={cn("mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold", style.badge)}>
                    {urgencyLabel(d.urgency)}
                  </span>
                ) : null}
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">{d.text}</p>
              </div>
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
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
    </div>
  )
}
