// AnalyteTrendRow
// Renders one analyte's series of measurements within a single multi-day
// encounter (typical inpatient stay). Defaults to a compact summary line —
// title + count chip + first→last trend + abnormal flag — and expands to
// reveal each per-day value with full reference range. Replaces the flat
// "HB / HB / HB / HB" duplication that made multi-day labs unreadable.
//
// Only used when the parent visit is `isMultiDay`; single-day visits keep
// the existing flat EncounterObservationCard rendering.
"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import { isAbnormalInterpretationLabel } from "@/src/shared/utils/interpretation-helpers"
import type { EncounterObservation } from "./EncounterObservationCard"
import type { EncounterTestSeries } from "../hooks/useEncounterDetails"

interface AnalyteTrendRowProps {
  series: EncounterTestSeries
  /** Optional override: passed by tests / future callers that want to
   *  pre-expand a specific analyte (e.g. for a deep-link). */
  defaultExpanded?: boolean
}

/** Trim full ISO date to MM-DD for compact in-row display. The visit header
 *  already shows the period, so the year is redundant context. */
function shortDate(iso?: string): string {
  if (!iso) return ''
  // ISO prefix is YYYY-MM-DD; slice 5..10 = MM-DD.
  return iso.slice(5, 10)
}

/** Just the numeric value from "2.8 1000/uL" → "2.8". Used to compare first
 *  vs last for the trend label. Returns null when the value isn't a leading
 *  number (qualitative results like "Negative" / "+/-"). */
function leadingNumber(value: string): number | null {
  const m = value.match(/^[-+]?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = parseFloat(m[0])
  return Number.isFinite(n) ? n : null
}

function isAbnormal(o: EncounterObservation): boolean {
  // Interpretation wins when present; the structured-range flag is only a
  // fallback for when the source shipped no interpretation (2026-07-08 policy).
  const label = o.interpretationLabel
  if (label) return isAbnormalInterpretationLabel(label)
  return !!o.refRangeAbnormal
}

/** Compute the one-line trend summary shown next to the analyte name. */
function buildTrendSummary(series: EncounterTestSeries): { primary: string; flag?: string } {
  const vals = series.values
  if (vals.length === 0) return { primary: '—' }
  if (vals.length === 1) return { primary: vals[0].value }

  const first = vals[0]
  const last = vals[vals.length - 1]
  const n0 = leadingNumber(first.value)
  const nN = leadingNumber(last.value)
  // All identical → just one value (no arrow).
  const allSame = vals.every((v) => v.value === first.value)
  const primary = allSame ? first.value : `${first.value} → ${last.value}`

  // Abnormal flag wording. Tries to detect the common "all low" / "all high"
  // pattern with a simple value-vs-range check; falls back to a count.
  if (series.abnormalCount === 0) return { primary }
  if (series.abnormalCount === vals.length) {
    // Direction: compare to range when we have numbers + a numeric range.
    const range = first.referenceText
    const dir = inferDirection(range, n0, nN)
    if (dir === 'low') return { primary, flag: '全部偏低' }
    if (dir === 'high') return { primary, flag: '全部偏高' }
    return { primary, flag: '全部異常' }
  }
  return { primary, flag: `${series.abnormalCount} 筆異常` }
}

/** Parse a referenceText like "[3.9–10.6 1000/uL]" → low/high numbers, then
 *  decide whether the value sits below low / above high. Returns null when
 *  the range isn't a closed numeric interval. */
function inferDirection(
  referenceText: string | undefined,
  firstNum: number | null,
  lastNum: number | null,
): 'low' | 'high' | null {
  if (!referenceText || firstNum == null || lastNum == null) return null
  // Match "[lo–hi <unit>]" or "[lo-hi <unit>]" — note FHIR's en-dash habit.
  const m = referenceText.match(/\[\s*([-+]?\d+(?:\.\d+)?)\s*[–-]\s*([-+]?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lo = parseFloat(m[1])
  const hi = parseFloat(m[2])
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
  if (firstNum < lo && lastNum < lo) return 'low'
  if (firstNum > hi && lastNum > hi) return 'high'
  return null
}

export function AnalyteTrendRow({ series, defaultExpanded = false }: AnalyteTrendRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const trend = buildTrendSummary(series)
  // Single-value series doesn't need a fold — render the row as a static
  // line so it sits alongside other analytes naturally.
  const isFoldable = series.values.length > 1
  const hasAnyAbnormal = series.abnormalCount > 0

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => isFoldable && setExpanded((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors",
          isFoldable ? "hover:bg-muted/60 cursor-pointer" : "cursor-default",
        )}
        aria-expanded={isFoldable ? expanded : undefined}
      >
        <span className="text-sm font-medium text-foreground shrink-0 min-w-[5rem]">
          {series.title}
        </span>
        {isFoldable && (
          <span className="inline-flex items-center rounded-full bg-muted/70 px-1.5 py-0 text-[0.625rem] tabular-nums text-muted-foreground shrink-0">
            {series.values.length}
          </span>
        )}
        <span
          className={cn(
            "text-sm tabular-nums",
            hasAnyAbnormal ? "text-red-600 dark:text-red-400 font-semibold" : "text-foreground",
          )}
        >
          {trend.primary}
        </span>
        {trend.flag && (
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-1.5 py-0 text-[0.625rem] font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            ⚠ {trend.flag}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {series.values[0]?.referenceText}
        </span>
        {isFoldable && (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        )}
      </button>

      {/* Expanded: per-day values. Each row carries its own abnormal styling
          so the eye can still pick out the bad days inside the series. */}
      {expanded && (
        <div className="ml-2 border-l-2 border-muted pl-3 py-1 space-y-0.5">
          {series.values.map((v) => {
            const abn = isAbnormal(v)
            return (
              <div
                key={v.id}
                className="flex items-baseline gap-2 text-xs"
              >
                <span className="font-mono text-muted-foreground shrink-0 min-w-[2.5rem]">
                  {shortDate(v.effectiveDateTime)}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    abn ? "text-red-600 dark:text-red-400 font-semibold" : "text-foreground",
                  )}
                >
                  {v.value}
                </span>
                {/* Interpretation label chip intentionally NOT rendered — abnormal
                    is shown by red value text only (per user, no badges). */}
                {v.referenceText && (
                  <span className="text-muted-foreground/80 text-[0.625rem]">{v.referenceText}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
