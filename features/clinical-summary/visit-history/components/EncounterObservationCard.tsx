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
}: {
  title: string
  value: string
  interpretationLabel?: string
  interpretationStyle?: string
  referenceText?: string
  refRangeAbnormal?: boolean
}) {
  const abnormal = isAbnormalStyle(interpretationStyle) || !!refRangeAbnormal
  const isLong = !interpretationLabel && value.length > 60

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 py-1.5 px-2 rounded hover:bg-muted/60 transition-colors">
      <span className="text-sm font-medium text-foreground shrink-0">{title}</span>
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
        {interpretationLabel && interpretationStyle && (
          <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium", interpretationStyle)}>
            {interpretationLabel}
          </span>
        )}
        {referenceText && (
          <span className="text-xs text-muted-foreground">{referenceText}</span>
        )}
      </div>
    </div>
  )
}

export function EncounterObservationCard({ observation }: { observation: EncounterObservation }) {
  return (
    <div>
      <ObsRow
        title={observation.title}
        value={observation.value}
        interpretationLabel={observation.interpretationLabel}
        interpretationStyle={observation.interpretationStyle}
        referenceText={observation.referenceText}
        refRangeAbnormal={observation.refRangeAbnormal}
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
