// Clinician-facing medication reconciliation: a compact cross-facility view
// of regimen composition, recent record changes, and concrete items to verify.
// Clinical safety findings intentionally remain in the separate safety card.
"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type {
  MedicalSummaryResult,
  MedicationChangeType,
  ResolvedSourceRef,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"

interface MedicationReconciliationCardProps {
  result: MedicalSummaryResult
  title: string
  regimenTitle: string
  changesTitle: string
  reconciliationTitle: string
  disclaimer: string
  changeTypeLabel: (type: MedicationChangeType) => string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  showMoreLabel: string
  showLessLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
}

const INITIAL_REGIMEN = 4
const INITIAL_CHANGES = 2
const INITIAL_RECONCILIATION = 2

const CHANGE_STYLES: Record<MedicationChangeType, string> = {
  new: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  stopped: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  resumed: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  changed: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  "cross-facility": "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  uncertain: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
}

function latestSource(sources: ResolvedSourceRef[]) {
  return sources
    .filter((source) => source.verified && source.date)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]
}

function sourceMeta(source?: ResolvedSourceRef) {
  return [source?.date, source?.organization].filter(Boolean).join(" · ")
}

export function MedicationReconciliationCard({
  result,
  title,
  regimenTitle,
  changesTitle,
  reconciliationTitle,
  disclaimer,
  changeTypeLabel,
  typeLabel,
  unverifiedLabel,
  showMoreLabel,
  showLessLabel,
  onNavigate,
}: MedicationReconciliationCardProps) {
  const [showAll, setShowAll] = useState(false)
  const review = result.medicationReview
  if (!review) return null

  const total = review.regimen.length + review.changes.length + review.reconciliation.length
  if (total === 0) return null

  const byKey = new Map(result.sourceIndex.map((source) => [source.key, source]))
  const sourcesFor = (keys: string[]) => keys
    .map((key) => byKey.get(key))
    .filter((source): source is ResolvedSourceRef => source !== undefined)

  const regimen = showAll ? review.regimen : review.regimen.slice(0, INITIAL_REGIMEN)
  const changes = showAll ? review.changes : review.changes.slice(0, INITIAL_CHANGES)
  const reconciliation = showAll
    ? review.reconciliation
    : review.reconciliation.slice(0, INITIAL_RECONCILIATION)
  const hiddenCount = total - regimen.length - changes.length - reconciliation.length

  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2.5" aria-labelledby="medication-reconciliation-title">
      <h3 id="medication-reconciliation-title" className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">
        {title}
      </h3>

      {review.overview ? (
        <p className="mb-2 rounded-md bg-muted/45 px-2.5 py-1.5 text-[0.75rem] leading-snug text-foreground/90">
          {review.overview}
        </p>
      ) : null}

      {regimen.length > 0 ? (
        <div>
          <h4 className="mb-1 text-[0.625rem] font-semibold text-muted-foreground">{regimenTitle}</h4>
          <div className="divide-y divide-border/70 rounded-md border border-border/80">
            {regimen.map((item, index) => {
              const sources = sourcesFor(item.sourceKeys)
              const meta = sourceMeta(latestSource(sources))
              return (
                <div key={`${item.name}-${index}`} className="flex min-w-0 items-start gap-2 px-2.5 py-1.5">
                  <span className="mt-px shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {item.group}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-semibold leading-snug text-foreground">
                      {item.name}
                      <SourceSup sources={sources} typeLabel={typeLabel} unverifiedLabel={unverifiedLabel} onNavigate={onNavigate} />
                    </p>
                    {(item.sig || meta) ? (
                      <p className="mt-0.5 text-[0.6875rem] leading-snug text-muted-foreground">
                        {[item.sig, meta].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {changes.length > 0 ? (
        <div className={cn(regimen.length > 0 && "mt-2")}>
          <h4 className="mb-1 text-[0.625rem] font-semibold text-muted-foreground">{changesTitle}</h4>
          <div className="space-y-1">
            {changes.map((item, index) => {
              const sources = sourcesFor(item.sourceKeys)
              const meta = sourceMeta(latestSource(sources))
              return (
                <div key={`${item.medication}-${index}`} className="rounded-md bg-muted/45 px-2.5 py-1.5">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <span className={cn("mt-px shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium", CHANGE_STYLES[item.type])}>
                      {changeTypeLabel(item.type)}
                    </span>
                    <p className="min-w-0 text-[0.8125rem] font-semibold leading-snug text-foreground">
                      {item.medication}
                      <SourceSup sources={sources} typeLabel={typeLabel} unverifiedLabel={unverifiedLabel} onNavigate={onNavigate} />
                    </p>
                    {meta ? <span className="ml-auto shrink-0 text-[0.625rem] text-muted-foreground">{meta}</span> : null}
                  </div>
                  <p className="mt-0.5 pl-0 text-[0.6875rem] leading-snug text-muted-foreground">{item.summary}</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {reconciliation.length > 0 ? (
        <div className={cn((regimen.length > 0 || changes.length > 0) && "mt-2")}>
          <h4 className="mb-1 text-[0.625rem] font-semibold text-muted-foreground">{reconciliationTitle}</h4>
          <div className="divide-y divide-border/70 rounded-md border border-amber-200/70 bg-amber-50/35 dark:border-amber-900/50 dark:bg-amber-950/10">
            {reconciliation.map((item, index) => {
              const sources = sourcesFor(item.sourceKeys)
              return (
                <p key={`${item.text}-${index}`} className="px-2.5 py-1.5 text-[0.75rem] leading-snug text-foreground/90">
                  {item.text}
                  <SourceSup sources={sources} typeLabel={typeLabel} unverifiedLabel={unverifiedLabel} onNavigate={onNavigate} />
                </p>
              )
            })}
          </div>
        </div>
      ) : null}

      {hiddenCount > 0 || showAll ? (
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

      <p className="mt-2 border-t pt-1.5 text-[0.625rem] leading-snug text-muted-foreground">
        {disclaimer}
      </p>
    </section>
  )
}
