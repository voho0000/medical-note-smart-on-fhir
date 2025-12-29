// Observation Block Component
import { cn } from "@/src/shared/utils/cn.utils"
import type { Observation } from '../types'
import { getCodeableConceptText, getValueWithUnit, formatDate, getReferenceRangeText } from '../utils/fhir-helpers'
import { getInterpretationTag } from '../utils/interpretation-helpers'

interface ObservationBlockProps {
  observation: Observation
}

export function ObservationBlock({ observation }: ObservationBlockProps) {
  const title = getCodeableConceptText(observation.code)
  const interp = getInterpretationTag(observation.interpretation)
  const ref = getReferenceRangeText(observation.referenceRange)
  const primaryValue = observation.valueQuantity
    ? getValueWithUnit(observation.valueQuantity)
    : observation.valueString || "—"

  return (
    <div className="rounded-lg border p-3 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground">{formatDate(observation.effectiveDateTime)}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-base font-semibold", interp && "text-foreground")}>{primaryValue}</span>
            {interp && (
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", interp.style)}>
                {interp.label}
              </span>
            )}
          </div>
        </div>

        {ref && <div className="text-xs text-muted-foreground">{ref}</div>}

        {Array.isArray(observation.component) && observation.component.length > 0 && (
          <div className="mt-2 divide-y rounded-md border bg-muted/40">
            {observation.component.map((component, idx) => {
              const name = getCodeableConceptText(component.code)
              const value = component.valueQuantity
                ? getValueWithUnit(component.valueQuantity)
                : component.valueString || "—"
              const componentInterp = getInterpretationTag(component.interpretation)
              const range = getReferenceRangeText(component.referenceRange)

              return (
                <div key={idx} className="grid gap-1 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{name}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn("font-semibold", componentInterp && "text-foreground")}>{value}</span>
                      {componentInterp && (
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", componentInterp.style)}>
                          {componentInterp.label}
                        </span>
                      )}
                    </div>
                  </div>
                  {range && <div className="text-xs text-muted-foreground">{range}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
