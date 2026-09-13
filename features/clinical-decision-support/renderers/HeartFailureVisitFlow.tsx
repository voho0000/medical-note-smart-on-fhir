"use client"

import { type ReactNode, useState } from 'react'
import type { CdssRecommendation } from '../types'
import {
  todayIsoDate,
  type ClinicVitals,
  type ClinicVitalsPatch,
} from '../stores/clinic-vitals.store'
import type { PhenotypeAnswer } from '../stores/phenotype-answer.store'
import type { PhysicianDecisionInput } from '../stores/physician-decisions.store'
import type { HfpefInputsPatch } from '../stores/hfpef-inputs.store'
import type { HfpefReading, HfpefScoreId } from '../utils/hfpef-scores'
import { HfpefInputsDialog } from './HfpefInputsDialog'
import { CareTimeline } from './CareTimeline'
import { RecordMetricEditor } from './RecordMetricEditor'
import { RecordValuesEditor, type RecordValueChange } from './RecordValuesEditor'
import type { HeartFailureBoardModel, HeartFailureMetric } from './heart-failure-board'
import { VisitFlow, focusVisitFlowTarget, visitRecordMetrics } from '../visit-flow/VisitFlow'
import { HEART_FAILURE_VISIT_FLOW_CONFIG } from '../visit-flow/heart-failure-visit-flow.config'
import type { VisitFlowModel, VisitFlowSurface } from '../visit-flow/types'

export { focusVisitFlowTarget, visitQuestionElementId, visitActionElementId } from '../visit-flow/VisitFlow'
export { doseAdjustmentDefaults } from '../visit-flow/controls/DoseAdjustmentEditor'

/** The measurements this stage can take back from the clinician. */
const METRIC_ENTRY_KEYS = { oxygenSaturation: 'oxygenSaturation', bodyHeight: 'bodyHeight', heartRate: 'heartRate', bodyWeight: 'bodyWeight', potassium: 'potassium', eGFR: 'eGFR', sodium: 'sodium', NTproBNP: 'NTproBNP', hemoglobin: 'hemoglobin' } as const

export interface HeartFailureVisitFlowProps {
  flow: VisitFlowModel
  board: HeartFailureBoardModel
  isEnglish: boolean
  now: Date
  /** Which recommendation's detail is open, shared with the module list's state. */
  expandedId: string | null
  onToggle: (id: string) => void
  /** The same decision detail every other surface opens. */
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  clinicVitals?: ClinicVitals
  onSaveClinicVitals?: (patch: ClinicVitalsPatch) => void
  onClearClinicVitals?: () => void
  phenotypeAnswer?: PhenotypeAnswer
  onAnswerPhenotype?: (answer: PhenotypeAnswer) => void
  onRecordDecision?: (moduleId: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (moduleId: string) => void
  /** The host's own HFpEF calculator reading, where the pathway raised one. */
  hfpefReading?: HfpefReading
  onSaveHfpefInputs?: (patch: HfpefInputsPatch) => void
  packVersion: string
  rhythmPanel?: ReactNode
}

/**
 * The heart-failure visit, in the five cards every visit flow draws.
 *
 * The cards are `visit-flow/VisitFlow.tsx` now, and the questions, the
 * decision reasons and the headlines are the heart-failure config. What is
 * left here is what only heart failure has: the echo-value editors, the HFpEF
 * calculator dialog, the rhythm panel and the care timeline.
 */
export function HeartFailureVisitFlow({
  flow,
  board,
  isEnglish,
  now,
  expandedId,
  onToggle,
  renderDetail,
  clinicVitals,
  onSaveClinicVitals,
  phenotypeAnswer,
  onAnswerPhenotype,
  onRecordDecision,
  onClearDecision,
  hfpefReading,
  onSaveHfpefInputs,
  packVersion,
  rhythmPanel,
}: HeartFailureVisitFlowProps) {
  const [calculatorTab, setCalculatorTab] = useState<HfpefScoreId>('hfa-peff')
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [editingMetric, setEditingMetric] = useState<HeartFailureMetric | null>(null)
  const [recordValuesOpen, setRecordValuesOpen] = useState(false)

  const surface: VisitFlowSurface = {
    board,
    isEnglish,
    now,
    ...(clinicVitals ? { clinicVitals } : {}),
    ...(onSaveClinicVitals ? { onSaveClinicVitals } : {}),
    ...(phenotypeAnswer ? { phenotypeAnswer } : {}),
    ...(onAnswerPhenotype ? { onAnswerPhenotype } : {}),
    ...(hfpefReading ? { hfpefReading } : {}),
    ...(onSaveHfpefInputs
      ? { onOpenCalculator: (id?: string) => { setCalculatorTab((id as HfpefScoreId) ?? 'hfa-peff'); setCalculatorOpen(true) } }
      : {}),
    recommendationById: (id) => (
      [...flow.actionGroups.flatMap((group) => group.rows.map((row) => row.recommendation))]
        .find((recommendation) => recommendation.id === id)
    ),
  }

  const allEditableMetrics = visitRecordMetrics(
    flow.metrics,
    HEART_FAILURE_VISIT_FLOW_CONFIG,
    surface,
  ) as HeartFailureMetric[]

  const saveMetrics = (changes: RecordValueChange[]) => {
    const entries: NonNullable<ClinicVitalsPatch['entries']> = {}
    for (const { metric, values, measuredOn } of changes) {
      if (metric.factKey === 'LVEF') {
        onAnswerPhenotype?.({ ...phenotypeAnswer, choice: undefined, lvef: values?.[0], measuredOn: values ? measuredOn : undefined, answeredOn: todayIsoDate(now) })
      } else if (metric.factKey === 'bloodPressure') {
        entries.systolic = values ? { value: values[0], measuredOn } : null
        entries.diastolic = values ? { value: values[1], measuredOn } : null
      } else {
        const key = METRIC_ENTRY_KEYS[metric.factKey as keyof typeof METRIC_ENTRY_KEYS]
        if (key) entries[key] = values ? { value: values[0], measuredOn } : null
        if (metric.factKey === 'NTproBNP') onSaveHfpefInputs?.({ ntprobnp: null })
      }
    }
    if (Object.keys(entries).length) onSaveClinicVitals?.({ entries })
    setEditingMetric(null)
    setRecordValuesOpen(false)
  }
  const saveMetric = (metric: HeartFailureMetric, values: number[] | null, measuredOn: string) => saveMetrics([{ metric, values, measuredOn }])

  return (
    <VisitFlow
      flow={flow}
      config={HEART_FAILURE_VISIT_FLOW_CONFIG}
      isEnglish={isEnglish}
      now={now}
      expandedId={expandedId}
      onToggle={onToggle}
      renderDetail={renderDetail}
      onRecordDecision={onRecordDecision}
      onClearDecision={onClearDecision}
      packVersion={packVersion}
      surface={surface}
      {...(onSaveClinicVitals ? { onOpenRecordEditor: () => setRecordValuesOpen(true) } : {})}
      {...(rhythmPanel ? { headlineExtra: rhythmPanel } : {})}
      questionsNote={flow.questions.some((question) => question.id === 'hfpef-confirmation') ? (
        <p
          className="border-b border-border px-3 py-1.5 text-[11px] leading-4 text-muted-foreground"
          data-testid="cdss-hf-questions-hfpef-note"
        >
          {isEnglish
            ? 'A patient with an LVEF of 50% or more gets one more question at the end of this assessment. It reads the answers to questions 2 and 3 to judge criterion (i), which is why it comes last.'
            : 'LVEF ≥50% 的病人在本次評估最後多一題。它讀第 2、3 題的答案判條件 (i)，所以排在後面。'}
        </p>
      ) : undefined}
      followUpExtra={board.timeline ? (
        <div className="border-t border-border px-3 py-2">
          <CareTimeline timeline={board.timeline} isEnglish={isEnglish} />
        </div>
      ) : undefined}
    >
      {editingMetric ? <RecordMetricEditor key={editingMetric.factKey} metric={editingMetric} isEnglish={isEnglish} now={now}
        onSave={(values, date) => saveMetric(editingMetric, values, date)}
        onRestore={() => saveMetric(editingMetric, null, todayIsoDate(now))}
        onClose={() => setEditingMetric(null)} /> : null}
      {recordValuesOpen ? <RecordValuesEditor rhythm={hfpefReading?.inputs.find(input => input.key === 'rhythm')?.value} onSaveRhythm={onSaveHfpefInputs} metrics={allEditableMetrics} isEnglish={isEnglish} now={now}
        onSave={saveMetrics} onClose={() => setRecordValuesOpen(false)} /> : null}
      {hfpefReading && onSaveHfpefInputs ? (
        <HfpefInputsDialog
          key={`${calculatorTab}-${calculatorOpen}`}
          initialTab={calculatorTab}
          open={calculatorOpen}
          onOpenChange={setCalculatorOpen}
          reading={hfpefReading}
          isEnglish={isEnglish}
          now={now}
          onApply={onSaveHfpefInputs}
          {...(natriureticRowId(flow)
            ? {
              onOrderNtProBnp: () => focusVisitFlowTarget({
                kind: 'action',
                moduleId: natriureticRowId(flow)!,
                index: 1,
              }),
            }
            : {})}
        />
      ) : null}
    </VisitFlow>
  )
}

/**
 * The row that would order an NT-proBNP, where the pack raised one.
 *
 * Read off the pack's own 「這項決策還缺」 rather than named here: which module
 * asks for the assay is the pack's to decide, and a hard-coded module id would
 * send the reader to a row that had moved.
 */
function natriureticRowId(flow: VisitFlowModel): string | undefined {
  return flow.actionGroups
    .flatMap((group) => group.rows)
    .find((row) => (
      row.recommendation.missingData?.some((item) => /NT-proBNP|BNP/i.test(item))
      || /NT-proBNP/i.test(row.headline)
    ))?.recommendation.id
}
