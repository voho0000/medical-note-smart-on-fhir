// 問題清單與負責院所 — the complete whole-person problem list. Four columns
// because the clinician's question is not only "what does this patient have"
// but "who is watching it and with what".
"use client"

import { useState } from "react"
import { ChevronDown, Flag } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import type { MedicalSummaryResult } from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"
import { resolveClaimSources } from "../utils/resolve-claim-sources"

interface ProblemsCardProps {
  result: MedicalSummaryResult
  title: string
  subtitle: string
  /** "{count} 項 · 依臨床重要性" */
  metaLabel: string
  columnLabels: { problem: string; metric: string; care: string }
  basisLabel: string
  /** Shown before the date when it is the organization's latest record
   *  rather than a visit for this problem, e.g. 該院最近紀錄. */
  organizationLatestLabel: string
  /** Tag on a metric whose trend the cited records cannot carry. */
  metricNeedsReviewLabel: string
  /** Shown after the date when the managing visit was inferred from the
   *  pharmacy refills the row cites, e.g. 由慢箋推定. */
  inferredLabel: string
  /** Tag on a problem that rests on medicines alone, e.g. 用藥推定. */
  medicationInferredLabel: string
  /** Tag on a lab problem resting on one unassessed value, e.g. 單次數值. */
  singleValueLabel: string
  verifyLabel: string
  legendLabel: string
  showAllLabel: string
  showLessLabel: string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  sourceTypeMismatchLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
}

// Eight rows is roughly one screen of the section before the fold; the rest of
// a 12-problem patient stays one click away rather than pushing 影像與病理重點
// off.
const INITIAL_VISIBLE = 8

export function ProblemsCard({
  result,
  title,
  subtitle,
  metaLabel,
  columnLabels,
  basisLabel,
  organizationLatestLabel,
  metricNeedsReviewLabel,
  inferredLabel,
  medicationInferredLabel,
  singleValueLabel,
  verifyLabel,
  legendLabel,
  showAllLabel,
  showLessLabel,
  typeLabel,
  unverifiedLabel,
  sourceTypeMismatchLabel,
  onNavigate,
}: ProblemsCardProps) {
  const [showAll, setShowAll] = useState(false)
  const problems = result.problems ?? []
  if (problems.length === 0) return null
  const byKey = new Map(result.sourceIndex.map((source) => [source.key, source]))
  const visible = showAll ? problems : problems.slice(0, INITIAL_VISIBLE)
  const hiddenCount = Math.max(0, problems.length - INITIAL_VISIBLE)

  return (
    <section
      className="rounded-lg border border-border bg-card px-3 py-2.5"
      aria-labelledby="medical-summary-problems-title"
    >
      {/* Narrow containers stack the two header lines: a wrapping subtitle and
          a right-aligned count interleave into an unreadable zig-zag. */}
      <div className="@container mb-1">
        <div className="flex flex-col gap-0 @min-[26rem]:flex-row @min-[26rem]:items-baseline @min-[26rem]:justify-between @min-[26rem]:gap-2">
          <h3
            id="medical-summary-problems-title"
            className="min-w-0 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground"
          >
            {title}
            <span className="ml-1 font-normal text-muted-foreground/80">{subtitle}</span>
          </h3>
          <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground/80">
            {metaLabel.replace("{count}", String(problems.length))}
          </span>
        </div>
      </div>

      {/* @container: at panel width the row is a four-column table the eye can
          scan down; narrower than that it stacks into two lines so neither the
          metric nor the managing clinic gets squeezed to one word per line. */}
      <div className="@container">
        <div className="hidden gap-x-2 border-b border-border pb-1 text-xs font-medium leading-snug text-muted-foreground @min-[30rem]:grid @min-[30rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_1rem]" data-problem-column-headings>
          <span>{columnLabels.problem}</span>
          <span>{columnLabels.metric}</span>
          <span>{columnLabels.care}</span>
        </div>
        <ul>
          {visible.map((problem, index) => {
            // Finalize-detected evidence-type mismatches (依據:心電圖 citing a
            // chest X-ray) tint that citation amber instead of hiding it.
            const suspectKeys = problem.suspectSourceKeys?.length
              ? new Set(problem.suspectSourceKeys)
              : undefined
            const sup = (keys: readonly string[] | undefined) => {
              if (!keys?.length) return null
              return (
                <SourceSup
                  sources={resolveClaimSources([...keys], byKey, problem.documentEvidence)}
                  typeLabel={typeLabel}
                  unverifiedLabel={unverifiedLabel}
                  suspectKeys={suspectKeys}
                  suspectLabel={sourceTypeMismatchLabel}
                  onNavigate={onNavigate}
                  className="ml-0.5"
                />
              )
            }
            // Per-column citations: each claim carries the records behind it.
            // Legacy results (demo snapshots, caches) hold one row-level list.
            const perColumn = Boolean(
              problem.basisSourceKeys || problem.metricSourceKeys || problem.medicationSourceKeys,
            )
            const managedBySup = sup(problem.managedBySourceKey ? [problem.managedBySourceKey] : undefined)
            const managedByDate = !problem.managedByDate
              ? undefined
              : problem.managedByScope === "organization"
                ? `${organizationLatestLabel} ${problem.managedByDate}`
                : problem.managedByScope === "inferred"
                  ? `${problem.managedByDate}（${inferredLabel}）`
                  : problem.managedByDate
            const managedByLine = [problem.managedBy, managedByDate]
              .filter(Boolean)
              .join(" · ")
            return (
              <li
                key={`${problem.label}-${index}`}
                className="grid grid-cols-1 gap-x-2 gap-y-0.5 border-b border-border py-1.5 last:border-b-0 @min-[30rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_1rem] @min-[30rem]:items-start"
              >
                <div className="min-w-0">
                  <p className="sr-only @min-[30rem]:hidden">{columnLabels.problem}</p>
                  <p className="text-[0.8125rem] font-semibold leading-snug text-foreground break-words">
                    {problem.label}
                    {problem.inferredFromMedication ? (
                      <span className="ml-1 inline-flex items-center rounded border border-border px-1 align-baseline text-[0.625rem] font-normal leading-4 text-muted-foreground">
                        {medicationInferredLabel}
                      </span>
                    ) : null}
                    {problem.singleUnassessedLab ? (
                      <span className="ml-1 inline-flex items-center rounded border border-border px-1 align-baseline text-[0.625rem] font-normal leading-4 text-muted-foreground">
                        {singleValueLabel}
                      </span>
                    ) : null}
                    {perColumn && !problem.basis ? sup(problem.basisSourceKeys) : null}
                  </p>
                  {problem.basis ? (
                    <p className="text-[0.6875rem] leading-snug text-muted-foreground break-words">
                      <span className="text-muted-foreground/80">{basisLabel}</span>
                      {problem.basis}
                      {perColumn ? sup(problem.basisSourceKeys) : null}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0" data-problem-column="metric">
                  {problem.metric || problem.metricMeta ? (
                    <p className="sr-only @min-[30rem]:hidden">{columnLabels.metric}</p>
                  ) : null}
                  {problem.metric ? (
                    <p className="text-xs leading-snug text-foreground break-words">
                      {problem.metric}
                      {problem.metricNeedsReview ? (
                        <span className="ml-1 inline-flex items-center rounded border border-amber-500/40 px-1 align-baseline text-[0.625rem] leading-4 text-amber-700 dark:text-amber-300">
                          {metricNeedsReviewLabel}
                        </span>
                      ) : null}
                      {perColumn ? sup(problem.metricSourceKeys) : null}
                    </p>
                  ) : null}
                  {problem.metricMeta ? (
                    <p className="text-[0.6875rem] leading-snug tabular-nums text-muted-foreground break-words">
                      {problem.metricMeta}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0" data-problem-column="care">
                  {managedByLine || problem.medications ? (
                    <p className="sr-only @min-[30rem]:hidden">{columnLabels.care}</p>
                  ) : null}
                  {managedByLine ? (
                    <p className="text-xs leading-snug text-foreground break-words">
                      {managedByLine}
                      {managedBySup}
                    </p>
                  ) : null}
                  {problem.medications ? (
                    <p className="text-[0.6875rem] leading-snug text-muted-foreground break-words">
                      {problem.medications}
                      {perColumn ? sup(problem.medicationSourceKeys) : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-start gap-1 @min-[30rem]:justify-end">
                  {problem.flag ? (
                    <Flag
                      className="h-3 w-3 shrink-0 text-amber-500 dark:text-amber-300"
                      aria-label={verifyLabel}
                    />
                  ) : null}
                  {perColumn ? null : sup(problem.sourceKeys)}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="flex items-center gap-1 text-[0.6875rem] leading-snug text-muted-foreground/80">
          <Flag className="h-3 w-3 shrink-0 text-amber-500 dark:text-amber-300" aria-hidden="true" />
          {legendLabel}
        </p>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="flex min-h-[44px] items-center gap-1 text-[0.6875rem] font-medium text-primary hover:text-primary/80 lg:min-h-8"
            aria-expanded={showAll}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
            {showAll
              ? showLessLabel
              : showAllLabel.replace("{count}", String(problems.length))}
          </button>
        ) : null}
      </div>
    </section>
  )
}
