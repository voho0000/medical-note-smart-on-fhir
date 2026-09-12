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
  ['oxygenSaturation', '97', '%', 95], ['bodyHeight', '165', 'cm', 170],
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

describe('combined clinical values dialog', () => {
  function setup() {
    const board = buildHeartFailureBoard(result, 'zh-TW', now)!
    const flow = buildHeartFailureVisitFlow({ board, result, now, isEnglish: false, patientId: 'synthetic', decisions: {} })
    const metrics = specs.map(([key, value, unit]) => ({ factKey: key, label: key, value, unit, date: value ? '2024-09-09' : undefined, kind: 'measure', entered: true, stale: false, evaluated: true } as HeartFailureMetric))
    const save = jest.fn(), answer = jest.fn(), hfpef = jest.fn()
    render(<HeartFailureVisitFlow board={board} flow={{ ...flow, metrics }} now={now} isEnglish={false}
      expandedId={null} onToggle={() => {}} renderDetail={() => null} packVersion="test"
      phenotypeAnswer={{ hfSuspicion: 'suspected', hfpEfConfirmed: true, answeredOn: '2026-09-12' }}
      onSaveClinicVitals={save} onAnswerPhenotype={answer} onSaveHfpefInputs={hfpef} />)
    fireEvent.click(screen.getByTestId('cdss-hf-record-values-edit'))
    return { save, answer, hfpef }
  }

  test('the clinical-information card opens the shared editor and saves multiple changes in one patch', () => {
    const { save, answer, hfpef } = setup()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    for (const [key] of specs) expect(screen.getByTestId(`record-values-${key}`)).toBeInTheDocument()
    expect(screen.getByLabelText('oxygenSaturation')).toBeInTheDocument()
    expect(screen.getByLabelText('bodyHeight')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('LVEF'), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText('potassium'), { target: { value: '5.1' } })
    fireEvent.change(screen.getByLabelText('NTproBNP'), { target: { value: '700' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ entries: { potassium: { value: 5.1, measuredOn: '2024-09-09' }, NTproBNP: { value: 700, measuredOn: '2026-09-12' } } })
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({ lvef: 45, hfSuspicion: 'suspected', hfpEfConfirmed: true }))
    expect(hfpef).toHaveBeenCalledWith({ ntprobnp: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('restore all removes overrides without clearing clinical answers', () => {
    const { save, answer } = setup()
    expect(screen.getAllByText('修改數值與日期後一次儲存；恢復預設會使用病歷原始值，無原始值則留空。')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '全部恢復預設' }))
    expect(screen.queryByText('儲存後恢復病歷原始值；沒有原始值則恢復為未填。')).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].entries).toEqual({ systolic: null, diastolic: null, heartRate: null, potassium: null, eGFR: null, sodium: null, bodyWeight: null, NTproBNP: null, oxygenSaturation: null, bodyHeight: null })
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({ lvef: undefined, measuredOn: undefined, hfSuspicion: 'suspected', hfpEfConfirmed: true }))
    const original = { id: 'synthetic', facts: { potassium: { zh: '3.7', en: '3.7', numericValue: 3.7 } } }
    const restored = applyClinicVitals(original, mergeClinicVitals(undefined, save.mock.calls[0][0], now))
    expect(restored.facts.potassium?.numericValue).toBe(3.7)
  })

  test('today shortcut updates a measurement date without opening the date picker', () => {
    const { answer } = setup()
    const lvef = screen.getByTestId('record-values-LVEF')
    fireEvent.change(screen.getByLabelText('LVEF'), { target: { value: '55' } })
    fireEvent.click(lvef.getElementsByTagName('button')[0])
    expect(screen.getByLabelText('LVEF 日期')).toHaveValue('2026-09-12')
    fireEvent.click(screen.getAllByRole('button', { name: '恢復預設' })[0])
    expect(screen.getByLabelText('LVEF')).toHaveValue(72.6)
    expect(screen.getByLabelText('LVEF 日期')).toHaveValue('2024-09-09')
    fireEvent.click(screen.getAllByRole('button', { name: '取消恢復' })[0])
    expect(screen.getByLabelText('LVEF')).toHaveValue(55)
    expect(screen.getByLabelText('LVEF 日期')).toHaveValue('2026-09-12')
    fireEvent.click(screen.getByRole('button', { name: '儲存修改' }))
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({ lvef: 55, measuredOn: '2026-09-12' }))
  })

  test('cancel discards edits and invalid LVEF blocks saving', () => {
    const { save, answer } = setup()
    fireEvent.change(screen.getByLabelText('LVEF'), { target: { value: '150' } })
    expect(screen.getByRole('button', { name: '儲存修改' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }))
    expect(save).not.toHaveBeenCalled()
    expect(answer).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
