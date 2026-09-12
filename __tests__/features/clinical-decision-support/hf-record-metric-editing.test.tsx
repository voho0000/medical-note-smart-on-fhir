import { render, screen, fireEvent } from '@testing-library/react'
import { HeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/HeartFailureVisitFlow'
import { buildHeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import { buildHeartFailureBoard, type HeartFailureMetric } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import { mergeClinicVitals } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import { applyPhenotypeAnswer } from '@/features/clinical-decision-support/utils/apply-phenotype-answer'
import { buildHfpefReading } from '@/features/clinical-decision-support/utils/hfpef-scores'
import type { CdssResult, CdssPatientProfile } from '@/features/clinical-decision-support/types'

const now = new Date('2026-09-12T10:00:00+08:00')
const result: CdssResult = { packId: 'heart-failure-cdss', packVersion: '2.0.0', title: '', summary: '', recommendations: [], notEvaluated: [], disclaimer: '' }
const specs = [
  ['LVEF', '72.6%', '%', 45], ['bloodPressure', '154/88', 'mmHg', 120], ['heartRate', '60', 'bpm', 70],
  ['potassium', '3.7', 'mmol/L', 5.6], ['eGFR', '32', 'mL/min/1.73m²', 48], ['sodium', '141', 'mmol/L', 135],
  ['bodyWeight', '78', 'kg', 75], ['NTproBNP', undefined, 'pg/mL', 1000],
] as const

test.each(specs)('%s can be edited from its record tile and reaches the profile with its measurement date', (key, value, unit, next) => {
  const board = buildHeartFailureBoard(result, 'zh-TW', now)!
  const flow = buildHeartFailureVisitFlow({ board, result, now, isEnglish: false, patientId: 'synthetic', decisions: {} })
  const metric = { factKey: key, label: key, value, unit, date: value ? '2024-09-09' : undefined, kind: 'measure', evaluated: true } as HeartFailureMetric
  const onSave = jest.fn(), onAnswer = jest.fn(), onHfpef = jest.fn()
  render(<HeartFailureVisitFlow board={board} flow={{ ...flow, metrics: [metric] }} now={now} isEnglish={false}
    expandedId={null} onToggle={() => {}} renderDetail={() => null} packVersion="2.0.0"
    onSaveClinicVitals={onSave} onAnswerPhenotype={onAnswer} onSaveHfpefInputs={onHfpef} />)
  fireEvent.click(screen.getByTestId(`cdss-hf-flow-metric-refill-${key}`))
  const inputs = screen.getAllByRole('spinbutton')
  fireEvent.change(inputs[0], { target: { value: String(next) } })
  if (key === 'bloodPressure') fireEvent.change(inputs[1], { target: { value: '80' } })
  fireEvent.change(screen.getByLabelText('量測／檢驗日期'), { target: { value: '2026-09-10' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存' }))
  const base: CdssPatientProfile = { id: 'synthetic', evaluatedAt: now.toISOString(), facts: {} }
  const updated = key === 'LVEF'
    ? applyPhenotypeAnswer(base, onAnswer.mock.calls[0][0])
    : applyClinicVitals(base, mergeClinicVitals(undefined, onSave.mock.calls[0][0], now))
  expect(updated.facts[key]?.date).toBe('2026-09-10')
  if (key === 'bloodPressure') expect(updated.facts[key]?.zh).toContain('120/80')
  else expect(updated.facts[key]?.numericValue).toBe(next)
  if (key === 'NTproBNP') expect(onHfpef).toHaveBeenCalledWith({ ntprobnp: null })
})

test('physician NT-proBNP overrides old laboratory autofill in HFpEF scoring', () => {
  const profile = applyClinicVitals({ id: 'synthetic', facts: {} }, mergeClinicVitals(undefined, {
    entries: { NTproBNP: { value: 1000, measuredOn: '2026-09-10' } },
  }, now))
  const reading = buildHfpefReading({ profile, autofill: { resolve: () => ({ value: 10, date: '2024-09-09', unit: 'pg/mL' }) } })
  expect(reading.inputs.find(i => i.key === 'ntprobnp')).toMatchObject({ value: '1000', origin: 'physician', date: '2026-09-10' })
  const restored = applyClinicVitals({ id: 'synthetic', facts: { NTproBNP: { zh: '10', en: '10', numericValue: 10 } } }, mergeClinicVitals(undefined, { entries: { NTproBNP: null } }, now))
  expect(restored.facts.NTproBNP?.numericValue).toBe(10)
})
