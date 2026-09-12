import { fireEvent, render, screen, within } from '@testing-library/react'
import { HeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/HeartFailureVisitFlow'
import { buildHeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import type { CdssResult } from '@/features/clinical-decision-support/types'
import type { PhenotypeAnswer } from '@/features/clinical-decision-support/stores/phenotype-answer.store'

const now = new Date('2026-09-12T10:00:00+08:00')

// Known phenotypes do not necessarily carry a physicianInputRequests field.
const result = {
  packId: 'heart-failure-cdss', packVersion: '2.0.0', title: 'HF', summary: '',
  notEvaluated: [], disclaimer: '',
  recommendations: [{
    id: 'heart-failure-phenotype', moduleName: '分型', moduleGroup: 'assessment',
    domain: 'diagnosis', priority: 'routine', status: 'no-action',
    title: 'HFpEF', recommendation: '', rationale: '',
    patientEvidence: [{ label: 'LVEF', value: '60%', factKeys: ['LVEF'] }],
    nextActions: [], guidelineReferences: [], safetyBoundary: '',
  }],
} as CdssResult

function view(answer?: PhenotypeAnswer, onAnswer = jest.fn(), isEnglish = false, patientId: string | undefined = 'test-patient') {
  const board = buildHeartFailureBoard(result, isEnglish ? 'en' : 'zh-TW', now)!
  const flow = buildHeartFailureVisitFlow({
    board, result, isEnglish, now, phenotypeAnswer: answer, decisions: {}, patientId,
  })
  return <HeartFailureVisitFlow flow={flow} board={board} isEnglish={isEnglish} now={now}
    expandedId={null} onToggle={jest.fn()} renderDetail={() => null}
    onSaveClinicVitals={jest.fn()} phenotypeAnswer={answer} onAnswerPhenotype={onAnswer} packVersion="2.0.0" />
}

test('a missing pack question still offers both answers and unlocks subsequent questions', () => {
  const onAnswer = jest.fn()
  const { rerender } = render(view(undefined, onAnswer))
  expect(screen.getByRole('radio', { name: '否，本次不懷疑' })).toBeVisible()
  fireEvent.click(screen.getByRole('radio', { name: '是，懷疑心衰竭' }))
  expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ hfSuspicion: 'suspected' }))
  rerender(view(onAnswer.mock.calls[0][0], onAnswer))
  expect(screen.queryByText('回答第 1 題後開放')).not.toBeInTheDocument()
  const question = document.getElementById('cdss-hf-question-hf-suspicion')!
  fireEvent.click(within(question).getByRole('button', { name: /改/ }))
  fireEvent.click(screen.getByRole('radio', { name: '否，本次不懷疑' }))
  rerender(view(onAnswer.mock.calls[1][0], onAnswer))
  expect(screen.getAllByText('本次不懷疑心衰竭，其餘題目略過。').length).toBeGreaterThan(0)
})

test('the missing-request fallback is localized', () => {
  render(view(undefined, jest.fn(), true))
  expect(screen.getByRole('radio', { name: 'Yes, heart failure is suspected' })).toBeVisible()
  expect(screen.getByRole('radio', { name: 'No, not suspected at this visit' })).toBeVisible()
})
