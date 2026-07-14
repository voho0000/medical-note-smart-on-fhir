// Observation Block Component - compact single-row display
import { useState } from 'react'
import type { Observation } from '../types'
import { getCodeableConceptText, getValueWithUnit, getOriginalValueWithUnit, getReferenceRangeText } from '../utils/fhir-helpers'
import { getAnalyteDisplayForObs } from '@/src/shared/utils/lab-normalize'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { getInterpretationTag, checkReferenceRangeAbnormal, isInterpretationAbnormal, isReferenceRangeAssessmentUnavailable } from '../utils/interpretation-helpers'
import { ObservationTrendDialog } from './ObservationTrendDialog'
import { TrendingUp } from 'lucide-react'
import { CompactLabResultRow } from '@/features/clinical-summary/components/CompactLabResultRow'

interface ObservationBlockProps {
  observation: Observation
  /** Visually marks this observation as a child of a report header while
   * keeping the value/reference columns aligned with the rest of the table. */
  nested?: boolean
}

function ObsRow({
  name,
  value,
  originalValue,
  interp,
  refText,
  rangeUnassessed,
  onTrendClick,
  isLongText,
  refRangeAbnormal,
  nested,
}: {
  name: string
  value: string
  originalValue?: string
  interp: ReturnType<typeof getInterpretationTag>
  refText: string
  rangeUnassessed?: boolean
  onTrendClick?: () => void
  isLongText?: boolean
  refRangeAbnormal?: boolean
  nested?: boolean
}) {
  // Interpretation wins when present; the structured-range flag is only a
  // fallback for when the source shipped no interpretation at all.
  const isAbnormal = interp ? isInterpretationAbnormal(interp) : !!refRangeAbnormal

  return (
    <CompactLabResultRow
      title={name}
      value={value}
      abnormal={isAbnormal}
      referenceText={refText}
      rangeUnassessed={rangeUnassessed}
      valueMaxWidthClassName={isLongText ? "max-w-[12rem]" : "max-w-[9rem]"}
      className="rounded-none border-0 bg-transparent px-2.5 py-1.5 hover:bg-muted/60"
      titleColumnClassName={nested ? "pl-4" : undefined}
      titleActions={onTrendClick ? (
          <button
            type="button"
            onClick={onTrendClick}
            className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
            aria-label="查看趨勢"
          >
            <TrendingUp className="h-4 w-4" />
          </button>
      ) : undefined}
      trailingContent={originalValue && originalValue !== value ? (
        <span className="sr-only">原始值: {originalValue}</span>
      ) : undefined}
    />
  )
}

export function ObservationBlock({ observation, nested = false }: ObservationBlockProps) {
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
                className={`mt-2 border-t pt-2 pr-2 text-sm font-semibold text-foreground ${nested ? 'pl-6' : 'pl-2'}`}
              >
                {heading}
              </div>
            )
          }
          const cName = getAnalyteDisplayForObs(component, audience, locale)
          const cValue = component.valueQuantity
            ? getValueWithUnit(component.valueQuantity)
            : component.valueString || getCodeableConceptText(component.valueCodeableConcept) || '—'
          return <ObsRow key={idx} name={cName || '—'} value={cValue} originalValue={cValue} interp={null} refText="" nested={nested} />
        })}
      </div>
    )
  }

  // Report Summary block: show as plain text, no trend
  if (isReportSummary) {
    return (
      <div className={`text-xs text-muted-foreground py-1 whitespace-pre-wrap leading-relaxed ${nested ? 'pl-6 pr-2' : 'px-2'}`}>
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
          rangeUnassessed={isReferenceRangeAssessmentUnavailable(observation)}
          nested={nested}
        />

        {/* Component sub-rows */}
        {hasComponents && (
          <div className="ml-4 mt-0.5 space-y-0 border-l pl-1.5">
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
                  rangeUnassessed={isReferenceRangeAssessmentUnavailable(component)}
                  nested={nested}
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
