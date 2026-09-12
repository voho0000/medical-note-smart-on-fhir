import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  doseAdjustmentDefaults,
  HeartFailureVisitFlow,
} from '@/features/clinical-decision-support/renderers/HeartFailureVisitFlow'
import { buildHeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import type { CdssRecommendation, CdssResult } from '@/features/clinical-decision-support/types'
import type { PhysicianDecisionMap } from '@/features/clinical-decision-support/stores/physician-decisions.store'

const now = new Date('2026-09-12T10:00:00+08:00')
const rec = (id: string, domain: CdssRecommendation['domain'], extra: Partial<CdssRecommendation> = {}): CdssRecommendation => ({
  id, moduleName: id, domain, priority: 'routine', status: 'review', title: id,
  recommendation: '', rationale: '', patientEvidence: [], nextActions: [id],
  guidelineReferences: [], safetyBoundary: '', ...extra,
})
const drug = rec('heart-failure-sglt2', 'medication', {
  status: 'no-action', overviewEvidenceFactKey: 'sglt2Therapy',
  patientEvidence: [{ label: 'SGLT2i', value: '目前用藥中：Dapagliflozin 10mg', factKeys: ['sglt2Therapy'] }],
})
const result: CdssResult = {
  packId: 'heart-failure-cdss', packVersion: '2.0.0', title: 'HF', summary: '', notEvaluated: [], disclaimer: '',
  recommendations: [rec('heart-failure-hfpef-treatment', 'medication', { status: 'no-action' }), drug, rec('heart-failure-monitoring', 'monitoring'), rec('cardiac-rehabilitation', 'monitoring'), rec('cardiac-rehabilitation-safety', 'safety')],
}
function model(decisions: PhysicianDecisionMap = {}, packResult = result) {
  const board = buildHeartFailureBoard(packResult, 'zh-TW', now)!
  return { board, flow: buildHeartFailureVisitFlow({
    board, result: packResult, isEnglish: false, now, decisions, patientId: 'synthetic',
    phenotypeAnswer: { hfSuspicion: 'suspected', answeredOn: '2026-09-12' },
  }) }
}
function Harness({ onRecord = jest.fn(), packResult = result }: { onRecord?: jest.Mock; packResult?: CdssResult }) {
  const [decisions, setDecisions] = useState<PhysicianDecisionMap>({})
  const { board, flow } = model(decisions, packResult)
  return <HeartFailureVisitFlow board={board} flow={flow} now={now} isEnglish={false}
    expandedId={null} onToggle={() => {}} renderDetail={() => null} packVersion="2.0.0"
    onRecordDecision={(id, input) => {
      onRecord(id, input)
      setDecisions({ ...decisions, [id]: { ...input, reasons: input.reasons ?? [], recordedAt: now.toISOString() } })
    }} />
}

test('current maintenance therapy defaults to prescribed with provenance, without writing a physician decision', () => {
  const onRecord = jest.fn()
  render(<Harness onRecord={onRecord} />)
  expect(screen.getByTestId('cdss-hf-action-category-heart-failure-sglt2')).toHaveTextContent('SGLT2i')
  expect(screen.getByTestId('cdss-hf-action-headline-heart-failure-sglt2'))
    .toHaveTextContent('依最高耐受劑量與追蹤資料持續治療。')
  const selected = screen.getByTestId('cdss-hf-decision-recorded-heart-failure-sglt2')
  expect(within(selected).getByText('已開立')).toBeVisible()
  expect(within(selected).getByText('依目前用藥紀錄帶入')).toBeVisible()
  expect(onRecord).not.toHaveBeenCalled()
  const { flow } = model()
  expect(flow.decidedCount).toBe(1)
  expect(flow.summaryText).toContain('已開立（依目前用藥紀錄）')
  fireEvent.click(within(selected).getByRole('button', { name: '修改' }))
  fireEvent.click(screen.getByTestId('cdss-hf-decision-heart-failure-sglt2-deferred'))
  expect(onRecord).toHaveBeenCalledWith('heart-failure-sglt2', expect.objectContaining({ decision: 'deferred' }))
  expect(screen.getByTestId('cdss-hf-decision-heart-failure-sglt2-deferred')).toHaveAttribute('aria-pressed', 'true')
  const reasons = screen.getByTestId('cdss-hf-decision-reasons-heart-failure-sglt2')
  expect(within(reasons).getByRole('button', { name: '容量不足／症狀性低血壓' })).toBeVisible()
  expect(within(reasons).getByRole('button', { name: 'eGFR 低於起始門檻' })).toBeVisible()
  expect(within(reasons).queryByRole('button', { name: 'K 偏高' })).not.toBeInTheDocument()
  expect(within(reasons).queryByRole('button', { name: '心率過慢' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('cdss-hf-decision-heart-failure-sglt2-contraindicated'))
  expect(within(reasons).getByRole('button', { name: '對本藥嚴重過敏' })).toBeVisible()
  expect(within(reasons).queryByRole('button', { name: '容量不足／症狀性低血壓' })).not.toBeInTheDocument()
})

test.each([
  ['heart-failure-monitoring', ['已安排追蹤', '已評估', '暫緩', '病人意願']],
  ['cardiac-rehabilitation', ['已轉介', '暫緩', '病人意願']],
])('%s offers task-specific decisions', (id, labels) => {
  render(<Harness />)
  const controls = within(screen.getByTestId(`cdss-hf-decision-${id}`))
  expect(controls.getAllByRole('button').map(button => button.textContent)).toEqual(labels)
  fireEvent.click(controls.getByRole('button', { name: labels[0] }))
  expect(within(screen.getByTestId(`cdss-hf-decision-recorded-${id}`)).getByText(labels[0])).toBeVisible()
  expect(screen.getByTestId('cdss-hf-summary-text')).toHaveTextContent(id === 'heart-failure-monitoring' ? 'Follow-up arranged' : 'Referred')
})

test('no default for a medication gap or missing current therapy; explicit choices take precedence', () => {
  const rowFor = (packResult: CdssResult, decisions: PhysicianDecisionMap = {}) => model(decisions, packResult).flow.actionGroups.flatMap(g => g.rows).find(r => r.recommendation.id === drug.id)!
  expect(rowFor({ ...result, recommendations: [{ ...drug, status: 'actionable' }] }).decision).toBeUndefined()
  expect(rowFor({ ...result, recommendations: [{ ...drug, patientEvidence: [] }] }).decision).toBeUndefined()
  const explicit = { decision: 'deferred' as const, reasons: [], recordedAt: now.toISOString(), packVersion: '2.0.0' }
  expect(rowFor(result, { [drug.id]: explicit }).decision).toEqual(explicit)
  expect(rowFor(result, { [drug.id]: explicit }).decisionSource).toBeUndefined()
})


test('dose adjustment prefills the current product strength and records per-dose units', () => {
  const onRecord = jest.fn()
  render(<Harness onRecord={onRecord} />)
  fireEvent.click(screen.getByTestId('cdss-hf-decision-edit-heart-failure-sglt2'))
  fireEvent.click(screen.getByTestId('cdss-hf-decision-heart-failure-sglt2-dose-adjusted'))
  const save = screen.getByRole('button', { name: '記錄' })
  expect(screen.getByRole('textbox', { name: '藥品規格' })).toHaveValue('Dapagliflozin 10mg')
  expect(screen.getByRole('textbox', { name: '原每次用量' })).toHaveValue('1')
  expect(screen.getByRole('combobox', { name: '單位' })).toHaveValue('錠')
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: '新每次用量' }), { target: { value: '0.5' } })
  expect(screen.getByRole('combobox', { name: '途徑' })).toHaveValue('PO')
  expect(screen.getByRole('combobox', { name: '頻次' })).toHaveValue('QD')
  fireEvent.click(save)
  expect(onRecord).toHaveBeenLastCalledWith('heart-failure-sglt2', expect.objectContaining({ decision: 'dose-adjusted', note: 'Dapagliflozin 10mg：1 → 0.5 錠 · PO · QD' }))
  fireEvent.click(screen.getByTestId('cdss-hf-decision-edit-heart-failure-sglt2'))
  expect(screen.getByRole('textbox', { name: '藥品規格' })).toHaveValue('Dapagliflozin 10mg')
  expect(screen.getByRole('textbox', { name: '原每次用量' })).toHaveValue('1')
  expect(screen.getByRole('textbox', { name: '新每次用量' })).toHaveValue('0.5')
  expect(screen.getByRole('combobox', { name: '單位' })).toHaveValue('錠')
  expect(screen.getByRole('combobox', { name: '途徑' })).toHaveValue('PO')
  expect(screen.getByRole('combobox', { name: '頻次' })).toHaveValue('QD')
  fireEvent.change(screen.getByRole('textbox', { name: '新每次用量' }), { target: { value: '1' } })
  expect(screen.getByRole('button', { name: '記錄' })).toBeDisabled()
})

test.each([
  ['Carvedilol 12.5 mg', { medication: 'Carvedilol 12.5 mg', previous: '1', unit: '錠' }],
  ['Sacubitril/valsartan 49/51 mg', { medication: 'Sacubitril/valsartan 49/51 mg', previous: '1', unit: '錠' }],
])('keeps %s together as the product strength and defaults to one tablet', (medication, expected) => {
  expect(doseAdjustmentDefaults(medication)).toEqual(expected)
})

test('prefills furosemide for a loop-diuretic dose adjustment without a recorded drug', () => {
  const diureticResult: CdssResult = {
    ...result,
    recommendations: [
      ...result.recommendations,
      rec('heart-failure-congestion-diuretic', 'medication', { status: 'actionable' }),
    ],
  }
  render(<Harness packResult={diureticResult} />)

  fireEvent.click(screen.getByTestId('cdss-hf-decision-heart-failure-congestion-diuretic-dose-adjusted'))

  expect(screen.getByRole('textbox', { name: '藥品規格' })).toHaveValue('Furosemide')
})


test('HF visit omits rehabilitation clearance but retains rehabilitation referral', () => {
  render(<Harness />)
  expect(screen.queryByTestId('cdss-hf-decision-cardiac-rehabilitation-safety')).not.toBeInTheDocument()
  expect(screen.getByTestId('cdss-hf-decision-cardiac-rehabilitation')).toBeVisible()
  const { flow } = model()
  expect(flow.decidableCount).toBe(3)
  expect(flow.actionGroups.flatMap(group => group.rows).some(row => row.recommendation.id === 'cardiac-rehabilitation-safety')).toBe(false)
})
