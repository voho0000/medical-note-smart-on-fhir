"use client"

import { CompactLabResultRow } from "@/features/clinical-summary/components/CompactLabResultRow"

type EncounterObservationComponent = {
  id: string
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
  refRangeAbnormal?: boolean
  refRangeUnassessed?: boolean
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
  refRangeUnassessed?: boolean
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
  interpretationStyle,
  referenceText,
  refRangeAbnormal,
  refRangeUnassessed,
  date,
}: {
  title: string
  value: string
  interpretationStyle?: string
  referenceText?: string
  refRangeAbnormal?: boolean
  refRangeUnassessed?: boolean
  /** When set, render the date (MM-DD) before the title — used by multi-day
   *  visits so the reader can tell otherwise-identical rows apart. */
  date?: string
}) {
  const abnormal = isAbnormalStyle(interpretationStyle) || !!refRangeAbnormal

  return (
    <CompactLabResultRow
      title={title}
      value={value}
      abnormal={abnormal}
      referenceText={referenceText}
      rangeUnassessed={refRangeUnassessed}
      leadingTitleContent={date ? (
        <span className="min-w-[2.5rem] shrink-0 font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
          {date}
        </span>
      ) : undefined}
    />
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
    <div className="space-y-0">
      <ObsRow
        title={observation.title}
        value={observation.value}
        interpretationStyle={observation.interpretationStyle}
        referenceText={observation.referenceText}
        refRangeAbnormal={observation.refRangeAbnormal}
        refRangeUnassessed={observation.refRangeUnassessed}
        date={showDate ? shortDate(observation.effectiveDateTime) : undefined}
      />
      {observation.components.length > 0 && (
        <div className="ml-4 space-y-0">
          {observation.components.map((c) => (
            <ObsRow
              key={c.id}
              title={c.title}
              value={c.value}
              interpretationStyle={c.interpretationStyle}
              referenceText={c.referenceText}
              refRangeAbnormal={c.refRangeAbnormal}
              refRangeUnassessed={c.refRangeUnassessed}
            />
          ))}
        </div>
      )}
    </div>
  )
}
