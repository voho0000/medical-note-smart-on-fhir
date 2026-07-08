"use client"

import { cn } from "@/src/shared/utils/cn.utils"

type EncounterObservationComponent = {
  id: string
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
  refRangeAbnormal?: boolean
}

export type EncounterObservation = {
  id: string
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
  effectiveDateTime?: string
  status?: string
  source: "diagnosticReport" | "observation"
  components: EncounterObservationComponent[]
  refRangeAbnormal?: boolean
  /** Lab-category id (cbc / chem / urine / …) for clinical grouping; absent for
   *  observations that don't map to a known category. */
  categoryId?: string
  /** Canonical analyte key (WBC / NA / …) used as the within-category sort key. */
  sortKey?: string
}

/** Trim full ISO date to MM-DD for compact in-row display alongside an
 *  analyte name. The visit header already shows the year + period, so the
 *  MM-DD prefix is enough context for the reader. */
function shortDate(iso?: string): string {
  if (!iso) return ''
  return iso.slice(5, 10)
}

function isAbnormalStyle(style?: string) {
  return !!style && style.includes("red")
}

function ObsRow({
  title,
  value,
  interpretationLabel,
  interpretationStyle,
  referenceText,
  refRangeAbnormal,
  date,
}: {
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
  refRangeAbnormal?: boolean
  /** When set, render the date (MM-DD) before the title — used by multi-day
   *  visits so the reader can tell otherwise-identical rows apart. */
  date?: string
}) {
  const abnormal = isAbnormalStyle(interpretationStyle) || !!refRangeAbnormal
  const isLong = !interpretationLabel && value.length > 60

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 py-1.5 px-2 rounded hover:bg-muted/60 transition-colors">
      <div className="flex items-baseline gap-2 shrink-0">
        {date && (
          <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums min-w-[2.5rem]">
            {date}
          </span>
        )}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {isLong ? (
          <span className="text-xs text-foreground/80 max-w-xs truncate">{value}</span>
        ) : (
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              abnormal ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}
          >
            {value}
          </span>
        )}
        {/* Interpretation label chip intentionally NOT rendered — abnormal is
            shown by red value text only (per user, no Normal/Abnormal badges). */}
        {referenceText && (
          <span className="text-xs text-muted-foreground">{referenceText}</span>
        )}
      </div>
    </div>
  )
}

export function EncounterObservationCard({
  observation,
  showDate = false,
}: {
  observation: EncounterObservation
  /** When true the observation date (MM-DD) is prepended to the title row.
   *  Set by VisitItem for multi-day visits so single-value labs aren't
   *  ambiguous about when they were drawn. */
  showDate?: boolean
}) {
  return (
    <div>
      <ObsRow
        title={observation.title}
        value={observation.value}
        interpretationLabel={observation.interpretationLabel}
        interpretationStyle={observation.interpretationStyle}
        referenceText={observation.referenceText}
        refRangeAbnormal={observation.refRangeAbnormal}
        date={showDate ? shortDate(observation.effectiveDateTime) : undefined}
      />
      {observation.components.length > 0 && (
        <div className="ml-4 border-l pl-3 space-y-0">
          {observation.components.map((c) => (
            <ObsRow
              key={c.id}
              title={c.title}
              value={c.value}
              interpretationLabel={c.interpretationLabel}
              interpretationStyle={c.interpretationStyle}
              referenceText={c.referenceText}
              refRangeAbnormal={c.refRangeAbnormal}
            />
          ))}
        </div>
      )}
    </div>
  )
}
