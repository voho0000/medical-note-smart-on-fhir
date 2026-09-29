// 初診快覽 hero — the one line that positions the patient, followed by
// 開藥前必看: a slot grid of the facts that change today's prescription.
// High-severity safety alerts are appended as extra rows here rather than
// living in a card of their own, because a clinician reading for thirty
// seconds should not have to find a second place where danger is kept.
"use client"

import type { ReactNode } from "react"
import { Check, ClipboardList, Copy, Flag } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/src/shared/utils/cn.utils"
import { useCopyToClipboard } from "@/src/shared/hooks/use-copy-to-clipboard"
import { trackEvent } from "@/src/application/telemetry/usage-analytics"
import type { MedicalSummaryResult } from "@/src/core/entities/medical-summary.entity"
import type { SafetyAlert } from "@/src/core/entities/safety-alert.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"
import { resolveClaimSources } from "../utils/resolve-claim-sources"

/** Copy for the app-derived allergy row. Kept as one object because the row is
 *  a single UI concern, not five unrelated strings. */
export interface AllergyRowCopy {
  /** Row label, e.g. 過敏 / Allergy. */
  label: string
  /** Shown when the bundle carries no AllergyIntolerance at all. */
  noRecordText: string
  /** Short badge marking the row as read straight from the records. */
  badgeLabel: string
  badgeHint: string
  /** Between listed allergens (、 in Chinese, ", " in English). */
  separator: string
}

interface OverviewHeroCardProps {
  result: MedicalSummaryResult
  title: string
  /** Deterministic coverage line, e.g. "健保雲端 · 至 2026-08-27". */
  dataRange: string | null
  mustKnowTitle: string
  /** Clinician-only checklist; the patient audience hides the whole block. */
  showMustKnow: boolean
  /** High-severity alerts, rendered as extra rows of the same grid. */
  highAlerts: SafetyAlert[]
  renderSafetySources?: (keys: string[], unsupportedKeys?: string[]) => ReactNode
  copyLabel: string
  copiedLabel: string
  copyFailedLabel: string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  allergyRow: AllergyRowCopy
  onNavigate?: (target: ResourceNavTarget) => void
}

export function OverviewHeroCard({
  result,
  title,
  dataRange,
  mustKnowTitle,
  showMustKnow,
  highAlerts,
  renderSafetySources,
  copyLabel,
  copiedLabel,
  copyFailedLabel,
  typeLabel,
  unverifiedLabel,
  allergyRow,
  onNavigate,
}: OverviewHeroCardProps) {
  const { copied, copy } = useCopyToClipboard()
  const byKey = new Map(result.sourceIndex.map((source) => [source.key, source]))
  const mustKnow = result.mustKnow ?? []
  const focus = result.focus ?? []
  // Six rows fill the two-column grid without pushing the focus card below the
  // fold; anything the model ranked lower is already the least urgent.
  const visibleMustKnow = showMustKnow ? mustKnow.slice(0, 6) : []
  // The allergy row is APP-DERIVED: the model is not asked about allergy at
  // all, because "the cloud holds no allergy record" is a statement about the
  // bundle with no key to cite. `undefined` means a cached result from before
  // this row existed — that is unknown, not empty, so nothing is rendered.
  const allergyRecords = showMustKnow ? result.allergyRecords : undefined
  const hasMustKnowBlock = showMustKnow && (
    visibleMustKnow.length > 0 || highAlerts.length > 0 || allergyRecords !== undefined
  )

  const handleCopy = async () => {
    const lines = [
      result.headline.trim(),
      ...(showMustKnow
        ? [
            ...visibleMustKnow.map((item) => `${item.label}：${item.text}`),
            ...highAlerts.map((alert) => `${alert.title}：${alert.detail}`),
            ...(allergyRecords === undefined
              ? []
              : [`${allergyRow.label}：${allergyRecords.length > 0
                  ? allergyRecords.map((record) => record.label).join(allergyRow.separator)
                  : allergyRow.noRecordText}`]),
          ]
        : []),
      ...focus.map((item, index) => `${index + 1}. ${item.title} — ${item.text}`),
    ].filter(Boolean)

    if (!await copy(lines.join("\n"))) {
      toast.error(copyFailedLabel)
      return
    }
    // Usage analytics: that the hero block was copied, never what was in it.
    trackEvent('summary_copy', { block: 'hero' })
  }

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-labelledby="medical-summary-overview-title"
    >
      <div className="bg-primary/[0.035] px-3.5 py-3 dark:bg-primary/[0.055]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
          </div>
          <h3
            id="medical-summary-overview-title"
            className="min-w-0 text-sm font-semibold text-foreground"
          >
            {title}
          </h3>
          <span className="ml-auto flex items-center gap-2">
            {dataRange ? (
              <span className="text-[0.6875rem] tabular-nums text-muted-foreground">{dataRange}</span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-[44px] shrink-0 gap-1.5 px-2 text-xs shadow-none hover:shadow-none lg:h-8"
              onClick={handleCopy}
              aria-label={copied ? copiedLabel : copyLabel}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-300" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copied ? copiedLabel : copyLabel}</span>
            </Button>
          </span>
        </div>
        <p className="mt-1.5 text-[0.875rem] font-semibold leading-snug text-foreground @min-[48rem]:text-[0.9375rem]">
          {result.headline}
        </p>
      </div>

      {hasMustKnowBlock ? (
        <div className="border-t border-border px-3.5 py-2">
          <h4 className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">
            <Flag className="h-3 w-3" aria-hidden="true" />
            {mustKnowTitle}
          </h4>
          {/* @container: the right panel is ~700px in a split view but much
              wider once the left panel collapses. Two columns halve the block's
              height when there is room; one column keeps label and sentence
              readable when there is not. */}
          <div className="@container">
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 @min-[30rem]:grid-cols-2">
              {visibleMustKnow.map((item) => {
                const sources = resolveClaimSources(item.sourceKeys, byKey, item.documentEvidence)
                return (
                  <li key={item.slot + item.label} className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 text-[0.8125rem] font-semibold leading-snug tabular-nums",
                        item.critical
                          ? "text-red-600 dark:text-clinical-abnormal"
                          : "text-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="min-w-0 text-xs leading-snug text-foreground/90">
                      {item.text}
                      <SourceSup
                        sources={sources}
                        typeLabel={typeLabel}
                        unverifiedLabel={unverifiedLabel}
                        onNavigate={onNavigate}
                      />
                    </span>
                  </li>
                )
              })}
              {highAlerts.map((alert) => (
                <li key={alert.id} className="flex items-baseline gap-1.5">
                  <span className="shrink-0 text-[0.8125rem] font-semibold leading-snug text-red-600 dark:text-clinical-abnormal">
                    {alert.title}
                  </span>
                  <span className="min-w-0 text-xs leading-snug text-foreground/90">
                    {alert.detail}
                    {renderSafetySources
                      ? renderSafetySources(alert.sources ?? [], alert.unsupportedSourceKeys)
                      : null}
                  </span>
                </li>
              ))}
              {allergyRecords === undefined ? null : (
                <li className="flex items-baseline gap-1.5">
                  <span className="shrink-0 text-[0.8125rem] font-semibold leading-snug text-foreground">
                    {allergyRow.label}
                  </span>
                  <span className="min-w-0 text-xs leading-snug text-foreground/90">
                    {allergyRecords.length > 0
                      ? allergyRecords.map((record, index) => (
                          <span key={record.sourceKey}>
                            {index > 0 ? allergyRow.separator : null}
                            {record.label}
                            <SourceSup
                              sources={resolveClaimSources([record.sourceKey], byKey)}
                              typeLabel={typeLabel}
                              unverifiedLabel={unverifiedLabel}
                              onNavigate={onNavigate}
                            />
                          </span>
                        ))
                      : allergyRow.noRecordText}
                    <span
                      className="ml-1 whitespace-nowrap rounded border border-border px-1 py-px align-middle text-[0.625rem] font-medium text-muted-foreground"
                      title={allergyRow.badgeHint}
                    >
                      {allergyRow.badgeLabel}
                    </span>
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  )
}
