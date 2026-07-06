// 問題清單 — AI-inferred active problem list synthesised across ALL data types
// (coded diagnoses, abnormal labs, dispensed meds, care plans, discharge
// summaries), NOT just claim ICD codes. Each row cites the records it was
// inferred from via a navigable SourceSup (parity with the other cards). The
// title flags it as an inference pending physician confirmation.
"use client"

import { cn } from "@/src/shared/utils/cn.utils"
import type {
  MedicalSummaryResult,
  ProblemKind,
  ResolvedSourceRef,
} from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"

// A care plan / discharge summary is a structured clinical record → reads as
// more authoritative (blue "紀錄"); everything else is a pattern inference
// (amber "推斷"). Label text comes from i18n via the `badgeLabel` map.
const KIND_BADGE: Record<ProblemKind, string> = {
  careplan: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  discharge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  diagnosis: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  lab: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  medication: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  other: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
}

interface ProblemListCardProps {
  result: MedicalSummaryResult
  title: string
  basisLabel: string
  /** Badge text per kind — careplan/discharge get their own; the rest share the
   *  "inferred" label. */
  badgeLabel: (kind: ProblemKind) => string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
}

export function ProblemListCard({
  result,
  title,
  basisLabel,
  badgeLabel,
  typeLabel,
  unverifiedLabel,
  onNavigate,
}: ProblemListCardProps) {
  // `?? []` tolerates results cached before the problems field existed.
  const problems = result.problems ?? []
  if (problems.length === 0) return null
  const byKey = new Map(result.sourceIndex.map((s) => [s.key, s]))

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground">{title}</h3>
      <div className="max-h-[30rem] divide-y divide-border overflow-y-auto scrollbar-thin-persistent">
        {problems.map((p, i) => {
          const sources = p.sourceKeys
            .map((k) => byKey.get(k))
            .filter((s): s is ResolvedSourceRef => s !== undefined)
          return (
            <div key={i} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-foreground break-words">
                  {p.label}
                  <SourceSup
                    sources={sources}
                    typeLabel={typeLabel}
                    unverifiedLabel={unverifiedLabel}
                    onNavigate={onNavigate}
                  />
                </p>
                {p.basis ? (
                  // e.g. "依據:照護計畫" — no ICD by design (LLM codes proved
                  // unstable/unverifiable; the navigable sources ARE the audit).
                  <p className="mt-0.5 text-xs text-muted-foreground break-words">
                    <span className="text-muted-foreground/80">{basisLabel}</span>
                    {p.basis}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 h-fit rounded-md px-2 py-0.5 text-[0.65rem] font-semibold",
                  KIND_BADGE[p.kind],
                )}
              >
                {badgeLabel(p.kind)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
