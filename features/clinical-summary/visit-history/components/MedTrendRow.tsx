// MedTrendRow
// Same idea as AnalyteTrendRow but for medications: one drug × N refills
// inside one multi-day encounter (a daily insulin dose, a 5-day antibiotic
// course). Default view is a single line with the drug name + refill count
// + date range; expand for per-refill detail (dose / freq / when).
//
// Only used when the parent visit is `isMultiDay`; single-day visits keep
// the flat MedicationRow rendering.
"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"
import { MedicationItem } from "@/features/clinical-summary/medications/components/MedicationItem"
import type { EncounterMedSeries } from "../hooks/useEncounterDetails"

interface MedTrendRowProps {
  series: EncounterMedSeries
  defaultExpanded?: boolean
  showExecutionPeriods?: boolean
  grouped?: boolean
}

/** Render the date range header (e.g. "05-18 ~ 05-22"). Falls back to the
 *  single date when first == last. */
function formatRange(first?: string, last?: string): string {
  const s = first?.slice(5, 10)
  const e = last?.slice(5, 10)
  if (s && e && s !== e) return `${s} ~ ${e}`
  return s || e || ''
}

export function MedTrendRow({
  series,
  defaultExpanded = false,
  showExecutionPeriods = false,
  grouped = false,
}: MedTrendRowProps) {
  const { t } = useLanguage()
  const mt = (t.medications as any)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const isFoldable = series.refills.length > 1
  const range = formatRange(series.firstDate, series.lastDate)
  const latest = series.refills[series.refills.length - 1]
  const executionPeriods = showExecutionPeriods
    ? series.refills
        .map((refill) => refill.executionPeriod)
        .filter((period) => period !== undefined)
    : undefined

  if (!latest) return null

  // MedicationItem is the only medication-row renderer in the app. This
  // component contributes just the multi-day refill disclosure control.
  return (
    <div className="@container space-y-0.5">
      <MedicationItem
        medication={latest}
        executionPeriods={executionPeriods}
        grouped={grouped}
      />
      {isFoldable && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] text-muted-foreground hover:bg-muted/50"
          aria-expanded={expanded}
        >
          <span className="tabular-nums">
            {series.refills.length} {mt.refillTimes ?? '次'}
          </span>
          {range && <span className="tabular-nums">· {range}</span>}
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-200",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      )}
      {isFoldable && expanded && (
        <div className="space-y-0.5 border-l-2 border-muted pl-2">
          {series.refills.map((refill) => (
            <MedicationItem
              key={refill.id}
              medication={refill}
              executionPeriods={
                showExecutionPeriods && refill.executionPeriod
                  ? [refill.executionPeriod]
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
