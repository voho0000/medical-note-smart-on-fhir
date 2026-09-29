// 最可能的就診主因 — the ranked top-3. The ranking itself is the product:
// which of a multi-morbid patient's problems most likely brought them in today,
// read from recent activity in the records rather than from a specialty filter.
"use client"

import { Flag } from "lucide-react"
import type { MedicalSummaryResult } from "@/src/core/entities/medical-summary.entity"
import type { ResourceNavTarget } from "@/src/application/stores/resource-navigation.store"
import { SourceSup } from "./SourceSup"
import { resolveClaimSources } from "../utils/resolve-claim-sources"

interface FocusCardProps {
  result: MedicalSummaryResult
  title: string
  subtitle: string
  /** "前 {count} 項" — the count is the honest cap, not a promise of three. */
  countLabel: string
  verifyLabel: string
  typeLabel: (resourceType?: string) => string
  unverifiedLabel: string
  onNavigate?: (target: ResourceNavTarget) => void
}

export function FocusCard({
  result,
  title,
  subtitle,
  countLabel,
  verifyLabel,
  typeLabel,
  unverifiedLabel,
  onNavigate,
}: FocusCardProps) {
  const items = result.focus ?? []
  if (items.length === 0) return null
  const byKey = new Map(result.sourceIndex.map((source) => [source.key, source]))

  return (
    <section
      className="rounded-lg border border-border bg-card px-3 py-2.5"
      aria-labelledby="medical-summary-focus-title"
    >
      {/* Narrow containers stack the two header lines: a wrapping subtitle and
          a right-aligned count interleave into an unreadable zig-zag. */}
      <div className="@container mb-1.5">
        <div className="flex flex-col gap-0 @min-[26rem]:flex-row @min-[26rem]:items-baseline @min-[26rem]:justify-between @min-[26rem]:gap-2">
          <h3
            id="medical-summary-focus-title"
            className="min-w-0 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground"
          >
            {title}
            <span className="ml-1 font-normal text-muted-foreground/80">{subtitle}</span>
          </h3>
          <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground/80">
            {countLabel.replace("{count}", String(items.length))}
          </span>
        </div>
      </div>

      <ol className="space-y-0">
        {items.map((item, index) => {
          const sources = resolveClaimSources(item.sourceKeys, byKey, item.documentEvidence)
          return (
            <li
              key={`${item.title}-${index}`}
              className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1.5 border-b border-border py-1.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="text-[0.8125rem] font-semibold tabular-nums text-primary"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold leading-snug text-foreground break-words">
                  {item.title}
                  {item.flag ? (
                    <Flag
                      className="ml-1 inline h-3 w-3 shrink-0 align-[-0.1em] text-amber-500 dark:text-amber-300"
                      aria-label={verifyLabel}
                    />
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-foreground/90 break-words">
                  {item.text}
                  <SourceSup
                    sources={sources}
                    typeLabel={typeLabel}
                    unverifiedLabel={unverifiedLabel}
                    onNavigate={onNavigate}
                  />
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
