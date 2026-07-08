// Observation Block Component - compact single-row display
import { useState } from 'react'
import { cn } from "@/src/shared/utils/cn.utils"
import type { Observation } from '../types'
import { getCodeableConceptText, getValueWithUnit, getOriginalValueWithUnit, getReferenceRangeText } from '../utils/fhir-helpers'
import { getAnalyteDisplayForObs } from '@/src/shared/utils/lab-normalize'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { getInterpretationTag, checkReferenceRangeAbnormal } from '../utils/interpretation-helpers'
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
  refRangeAbnormal,
}: {
  name: string
  value: string
  originalValue?: string
  interp: ReturnType<typeof getInterpretationTag>
  refText: string
  onTrendClick?: () => void
  isLongText?: boolean
  refRangeAbnormal?: boolean
}) {
  const isAbnormal = (!!interp && interp.label !== 'Normal') || !!refRangeAbnormal

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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground max-w-[8rem] truncate">{refText}</span>
            </TooltipTrigger>
            <TooltipContent>{refText}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export function ObservationBlock({ observation }: ObservationBlockProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  // Display label is audience-aware: medical → canonical short code
  // (Na / K / BUN …); patient → long-form name in the active UI language
  // (中文：「鈉 / 鉀 / 尿素氮」; en: "Sodium / Potassium / BUN"). Sort and
  // categorisation upstream still use the canonical key, so switching
  // audience changes the label without re-ordering rows.
  // Non-canonical rows (cultures, antibiotic susceptibilities, free-text
  // reports) keep their bridge-sent text unchanged.
  const { audience } = useAudience()
  const { locale } = useLanguage()
  const title = getAnalyteDisplayForObs(observation, audience, locale)
  const interp = getInterpretationTag(observation.interpretation)
  const ref = getReferenceRangeText(observation.referenceRange)
  const hasComponents = Array.isArray(observation.component) && observation.component.length > 0
  const isReportSummary = observation.code?.text === 'Report Summary'
  // Procedure detail container: the row header already shows the title + date,
  // so render only the attribute rows (no redundant title/value line, no trend).
  const detailsOnly = (observation as { _detailsOnly?: boolean })._detailsOnly === true

  // Value fallback order: numeric → free text → coded value (valueCodeableConcept,
  // e.g. mCODE cancer-staging "T2a" / tumour-marker status) → em-dash.
  const codedValue = getCodeableConceptText(observation.valueCodeableConcept)
  const primaryValue = observation.valueQuantity
    ? getValueWithUnit(observation.valueQuantity)
    : observation.valueString || codedValue || '—'
  const originalPrimaryValue = observation.valueQuantity
    ? getOriginalValueWithUnit(observation.valueQuantity)
    : observation.valueString || codedValue || '—'
  const isLongText = !observation.valueQuantity && (observation.valueString?.length ?? 0) > 80

  // Procedure detail container: flat list of attribute rows, no main row.
  // Components flagged `_isSubHeader` (a grouped session's sub-procedure name)
  // render as a bold divider heading instead of a name/value row.
  if (detailsOnly && hasComponents) {
    return (
      <div className="space-y-0">
        {observation.component!.map((component, idx) => {
          if ((component as { _isSubHeader?: boolean })._isSubHeader) {
            const heading = getCodeableConceptText(component.code) || '—'
            return (
              <div
                key={idx}
                className="mt-2 border-t pt-2 px-2 text-sm font-semibold text-foreground"
              >
                {heading}
              </div>
            )
          }
          const cName = getAnalyteDisplayForObs(component, audience, locale)
          const cValue = component.valueQuantity
            ? getValueWithUnit(component.valueQuantity)
            : component.valueString || getCodeableConceptText(component.valueCodeableConcept) || '—'
          return <ObsRow key={idx} name={cName || '—'} value={cValue} originalValue={cValue} interp={null} refText="" />
        })}
      </div>
    )
  }

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
          refRangeAbnormal={checkReferenceRangeAbnormal(observation)}
        />

        {/* Component sub-rows */}
        {hasComponents && (
          <div className="ml-4 border-l pl-3 mt-0.5 space-y-0">
            {observation.component!.map((component, idx) => {
              const cName = getAnalyteDisplayForObs(component, audience, locale)
              const cCoded = getCodeableConceptText(component.valueCodeableConcept)
              const cValue = component.valueQuantity
                ? getValueWithUnit(component.valueQuantity)
                : component.valueString || cCoded || '—'
              const cOriginal = component.valueQuantity
                ? getOriginalValueWithUnit(component.valueQuantity)
                : component.valueString || cCoded || '—'
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
                  refRangeAbnormal={checkReferenceRangeAbnormal(component)}
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
