// 問題清單與負責院所 — the complete whole-person problem list: what the
// patient has, who follows it, and with what values and medicines. One markup,
// laid out by the card's own width (the right panel is resizable): two
// columns when there is room — problem, basis and managing facility on the
// left; key values and medicine tokens on the right — and stacked rows when
// narrow. Medicines are tokens with the drug master's short name; the record's
// full name stays in each token's title.
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
  columnLabels: { problem: string; metric: string }
  /** Small label before the metric when the columns are stacked, e.g. 指標. */
  metricLabel: string
  /** "+{count} 項" — the medicines folded behind the first few. */
  medicationsMoreLabel: string
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
// A row shows its first few medicines; the rest open on request.
const INITIAL_MEDICATIONS = 3

export function ProblemsCard({
  result,
  title,
  subtitle,
  metaLabel,
  columnLabels,
  metricLabel,
  medicationsMoreLabel,
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
  const [openMedications, setOpenMedications] = useState<ReadonlySet<number>>(new Set())
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

      {/* @container: two columns from 34rem of card width, stacked below; in
          between (28–34rem) the managing facility sits beside the name. */}
      <div className="@container">
        <div className="hidden gap-x-4 border-b border-border pb-1 text-xs font-medium leading-snug text-muted-foreground @min-[34rem]:grid @min-[34rem]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" data-problem-column-headings>
          <span>{columnLabels.problem}</span>
          <span>{columnLabels.metric}</span>
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
                  tone="quiet"
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
            const medicationItems = problem.medicationItems ?? []
            const medicationsOpen = openMedications.has(index)
            const shownMedications = medicationsOpen ? medicationItems : medicationItems.slice(0, INITIAL_MEDICATIONS)
            const foldedMedications = medicationItems.length - shownMedications.length
            const tag = (label: string) => (
              <span className="ml-1 inline-flex items-center rounded border border-border px-1 align-baseline text-[0.625rem] font-normal leading-4 text-muted-foreground">
                {label}
              </span>
            )
            return (
              <li
                key={`${problem.label}-${index}`}
                className="grid grid-cols-1 gap-y-1 border-b border-border py-2 last:border-b-0 @min-[34rem]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @min-[34rem]:gap-x-4"
              >
                <div className="min-w-0" data-problem-column="problem">
                  <div className="flex flex-col @min-[28rem]:flex-row @min-[28rem]:items-baseline @min-[28rem]:justify-between @min-[28rem]:gap-3 @min-[34rem]:flex-col @min-[34rem]:items-stretch @min-[34rem]:gap-0">
                    <p className="min-w-0 text-[0.8125rem] font-semibold leading-snug text-foreground break-words">
                      {problem.label}
                      {problem.inferredFromMedication ? tag(medicationInferredLabel) : null}
                      {problem.singleUnassessedLab ? tag(singleValueLabel) : null}
                      {problem.flag ? (
                        <Flag
                          className="ml-1 inline h-3 w-3 shrink-0 align-[-0.125em] text-amber-500 dark:text-amber-300"
                          aria-label={verifyLabel}
                        />
                      ) : null}
                      {perColumn && !problem.basis ? sup(problem.basisSourceKeys) : null}
                      {perColumn ? null : sup(problem.sourceKeys)}
                    </p>
                    {managedByLine ? (
                      <p className="text-[0.6875rem] leading-snug tabular-nums text-muted-foreground break-words @min-[28rem]:shrink-0 @min-[28rem]:text-right @min-[34rem]:text-left" data-problem-managed-by>
                        {managedByLine}
                        {managedBySup}
                      </p>
                    ) : null}
                  </div>
                  {problem.basis ? (
                    <p className="text-[0.6875rem] leading-snug text-muted-foreground break-words">
                      <span className="text-muted-foreground/80">{basisLabel}</span>
                      {problem.basis}
                      {perColumn ? sup(problem.basisSourceKeys) : null}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-1" data-problem-column="metric">
                  {problem.metric ? (
                    <p className="text-xs leading-snug tabular-nums text-foreground break-words">
                      <span className="mr-1.5 text-[0.6875rem] text-muted-foreground @min-[34rem]:sr-only">{metricLabel}</span>
                      {problem.metric}
                      {problem.metricNeedsReview ? (
                        <span className="ml-1 inline-flex items-center rounded border border-amber-500/40 px-1 align-baseline text-[0.625rem] leading-4 text-amber-700 dark:text-amber-300">
                          {metricNeedsReviewLabel}
                        </span>
                      ) : null}
                      {problem.metricMeta ? (
                        <span className="ml-1 text-[0.6875rem] text-muted-foreground">（{problem.metricMeta}）</span>
                      ) : null}
                      {perColumn ? sup(problem.metricSourceKeys) : null}
                    </p>
                  ) : null}
                  {medicationItems.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1" data-problem-medications>
                      {shownMedications.map((item) => (
                        <span
                          key={item.key}
                          title={item.fullName}
                          className="inline-block max-w-full truncate rounded-full border border-border bg-muted px-1.5 text-[0.6875rem] leading-[1.125rem] text-foreground"
                          data-problem-medication
                        >
                          {item.name}
                        </span>
                      ))}
                      {foldedMedications > 0 || (medicationsOpen && medicationItems.length > INITIAL_MEDICATIONS) ? (
                        <button
                          type="button"
                          onClick={() => setOpenMedications((current) => {
                            const next = new Set(current)
                            if (next.has(index)) next.delete(index)
                            else next.add(index)
                            return next
                          })}
                          aria-expanded={medicationsOpen}
                          className="relative rounded-full px-1 text-[0.6875rem] leading-[1.125rem] text-primary hover:text-primary/80 before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] lg:before:-inset-y-1"
                        >
                          {medicationsOpen ? showLessLabel : medicationsMoreLabel.replace("{count}", String(foldedMedications))}
                        </button>
                      ) : null}
                      {perColumn ? sup(problem.medicationSourceKeys) : null}
                    </div>
                  ) : problem.medications ? (
                    // A result from before per-medicine items: the joined names.
                    <p className="text-[0.6875rem] leading-snug text-muted-foreground break-words">
                      {problem.medications}
                      {perColumn ? sup(problem.medicationSourceKeys) : null}
                    </p>
                  ) : null}
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
