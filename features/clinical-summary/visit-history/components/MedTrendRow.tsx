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
import type { EncounterMedication } from "./EncounterCards"
import type { EncounterMedSeries } from "../hooks/useEncounterDetails"

interface MedTrendRowProps {
  series: EncounterMedSeries
  defaultExpanded?: boolean
}

/** Render the date range header (e.g. "05-18 ~ 05-22"). Falls back to the
 *  single date when first == last. */
function formatRange(first?: string, last?: string): string {
  const s = first?.slice(5, 10)
  const e = last?.slice(5, 10)
  if (s && e && s !== e) return `${s} ~ ${e}`
  return s || e || ''
}

export function MedTrendRow({ series, defaultExpanded = false }: MedTrendRowProps) {
  const { t } = useLanguage()
  const mt = (t.medications as any)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const isFoldable = series.refills.length > 1
  const range = formatRange(series.firstDate, series.lastDate)

  return (
    <div className="rounded-lg border bg-background shadow-sm">
      <button
        type="button"
        onClick={() => isFoldable && setExpanded((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left",
          isFoldable ? "hover:bg-muted/40 cursor-pointer" : "cursor-default",
        )}
        aria-expanded={isFoldable ? expanded : undefined}
      >
        <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">
            {series.name}
          </span>
          {series.isChronic && (
            <span
              title={mt.chronicTooltip ?? 'Continuous long term therapy'}
              className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0 text-[0.625rem] font-medium text-violet-700"
            >
              {mt.chronic ?? '慢箋'}
            </span>
          )}
          {isFoldable && (
            <span className="inline-flex items-center rounded-full bg-muted/70 px-1.5 py-0 text-[0.625rem] tabular-nums text-muted-foreground">
              {series.refills.length}
            </span>
          )}
          {range && (
            <span className="text-xs text-muted-foreground tabular-nums">{range}</span>
          )}
        </div>
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

      {/* Single-refill series: still want to show the dose detail / status,
          since it's the entire row content. Expanded multi-refill shows each
          refill's own when + detail + status. */}
      {!isFoldable && (
        <RefillDetail medication={series.refills[0]} />
      )}
      {isFoldable && expanded && (
        <div className="border-t bg-muted/30 px-3 py-2 space-y-1.5">
          {series.refills.map((r) => (
            <div key={r.id} className="rounded-md bg-background px-2 py-1.5">
              <RefillDetail medication={r} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RefillDetail({
  medication,
  compact = false,
}: {
  medication: EncounterMedication
  compact?: boolean
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5", compact ? "text-xs px-0" : "px-3 pb-2 text-xs")}>
      {medication.when && (
        <span className="font-mono text-muted-foreground tabular-nums">{medication.when}</span>
      )}
      {medication.detail && (
        <span className="text-foreground/80">{medication.detail}</span>
      )}
      {medication.status && (
        <span
          className={cn(
            "ml-auto inline-flex items-center rounded-full border px-1.5 py-0 text-[0.625rem] capitalize",
            medication.status === 'active'
              ? "border-sky-200 bg-sky-50 text-sky-700"
              : "border-muted bg-muted/60 text-muted-foreground",
          )}
        >
          {medication.status}
        </span>
      )}
    </div>
  )
}
