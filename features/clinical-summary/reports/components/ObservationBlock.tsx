// Observation Block Component
import { useState } from 'react'
import { cn } from "@/src/shared/utils/cn.utils"
import type { Observation } from '../types'
import { getCodeableConceptText, getValueWithUnit, formatDate, getReferenceRangeText } from '../utils/fhir-helpers'
import { getInterpretationTag } from '../utils/interpretation-helpers'
import { ObservationTrendDialog } from './ObservationTrendDialog'
import { TrendingUp } from 'lucide-react'

interface ObservationBlockProps {
  observation: Observation
}

export function ObservationBlock({ observation }: ObservationBlockProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const title = getCodeableConceptText(observation.code)
  const interp = getInterpretationTag(observation.interpretation)
  const ref = getReferenceRangeText(observation.referenceRange)
  const primaryValue = observation.valueQuantity
    ? getValueWithUnit(observation.valueQuantity)
    : observation.valueString || "—"

  return (
    <>
      <div className="rounded-lg border p-3 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex-1">
              <button
                onClick={() => setDialogOpen(true)}
                className="group flex items-center gap-2 text-left hover:text-primary transition-colors"
              >
                <div className="text-sm font-semibold text-foreground group-hover:text-primary">
                  {title}
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
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

      <ObservationTrendDialog
        observation={observation}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
