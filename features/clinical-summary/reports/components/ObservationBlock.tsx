// Observation Block Component - compact single-row display
import { useState } from 'react'
import { cn } from "@/src/shared/utils/cn.utils"
import type { Observation } from '../types'
import { getCodeableConceptText, getValueWithUnit, getOriginalValueWithUnit, getReferenceRangeText } from '../utils/fhir-helpers'
import { getInterpretationTag } from '../utils/interpretation-helpers'
import { ObservationTrendDialog } from './ObservationTrendDialog'
import { TrendingUp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ObservationBlockProps {
  observation: Observation
}

function ObsRow({
  name,
  value,
  originalValue,
  interp,
  refText,
  onTrendClick,
  isLongText,
}: {
  name: string
  value: string
  originalValue?: string
  interp: ReturnType<typeof getInterpretationTag>
  refText: string
  onTrendClick?: () => void
  isLongText?: boolean
}) {
  const isAbnormal = !!interp && interp.label !== 'Normal'

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 py-1.5 px-2 rounded hover:bg-muted/60 transition-colors">
      {/* Left: name + trend */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm font-medium text-foreground truncate">{name}</span>
          </TooltipTrigger>
          <TooltipContent>{name}</TooltipContent>
        </Tooltip>
        {onTrendClick && (
          <button
            onClick={onTrendClick}
            className="text-muted-foreground hover:text-primary transition-colors"
            aria-label="查看趨勢"
          >
            <TrendingUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Right: value + interp + ref */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {isLongText ? (
          <span className="text-xs text-foreground/80 max-w-xs truncate">{value}</span>
        ) : (
          <span
            className={cn('text-sm font-semibold tabular-nums', isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-foreground')}
            title={originalValue && originalValue !== value ? `原始值: ${originalValue}` : undefined}
          >
            {value}
          </span>
        )}
        {interp && (
          <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium', interp.style)}>
            {interp.label}
          </span>
        )}
        {refText && (
          <span className="text-xs text-muted-foreground">{refText}</span>
        )}
      </div>
    </div>
  )
}

export function ObservationBlock({ observation }: ObservationBlockProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const title = getCodeableConceptText(observation.code)
  const interp = getInterpretationTag(observation.interpretation)
  const ref = getReferenceRangeText(observation.referenceRange)
  const hasComponents = Array.isArray(observation.component) && observation.component.length > 0
  const isReportSummary = observation.code?.text === 'Report Summary'

  const primaryValue = observation.valueQuantity
    ? getValueWithUnit(observation.valueQuantity)
    : observation.valueString || '—'
  const originalPrimaryValue = observation.valueQuantity
    ? getOriginalValueWithUnit(observation.valueQuantity)
    : observation.valueString || '—'
  const isLongText = !observation.valueQuantity && (observation.valueString?.length ?? 0) > 80

  // Report Summary block: show as plain text, no trend
  if (isReportSummary) {
    return (
      <div className="text-xs text-muted-foreground px-2 py-1 whitespace-pre-wrap leading-relaxed">
        {observation.valueString}
        {Array.isArray(observation.component) && observation.component.map((c, i) => (
          <div key={i} className="mt-1">
            <span className="font-medium text-foreground/70">{getCodeableConceptText(c.code)}: </span>
            {c.valueString}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div>
        {/* Main observation row */}
        <ObsRow
          name={title || '—'}
          value={primaryValue}
          originalValue={originalPrimaryValue}
          interp={interp}
          refText={ref}
          onTrendClick={!hasComponents ? () => setDialogOpen(true) : undefined}
          isLongText={isLongText}
        />

        {/* Component sub-rows */}
        {hasComponents && (
          <div className="ml-4 border-l pl-3 mt-0.5 space-y-0">
            {observation.component!.map((component, idx) => {
              const cName = getCodeableConceptText(component.code)
              const cValue = component.valueQuantity
                ? getValueWithUnit(component.valueQuantity)
                : component.valueString || '—'
              const cOriginal = component.valueQuantity
                ? getOriginalValueWithUnit(component.valueQuantity)
                : component.valueString || '—'
              const cInterp = getInterpretationTag(component.interpretation)
              const cRef = getReferenceRangeText(component.referenceRange)
              return (
                <ObsRow
                  key={idx}
                  name={cName || '—'}
                  value={cValue}
                  originalValue={cOriginal}
                  interp={cInterp}
                  refText={cRef}
                />
              )
            })}
          </div>
        )}
      </div>

      <ObservationTrendDialog
        observation={observation}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}
