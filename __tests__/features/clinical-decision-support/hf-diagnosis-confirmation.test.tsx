import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { HeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/HeartFailureVisitFlow'
import { buildHeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import type { PhenotypeAnswer } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import type { CdssResult } from '@/features/clinical-decision-support/types'

const now = new Date('2026-09-17T02:00:00Z')
const result: CdssResult = {
  packId: 'heart-failure-cdss', packVersion: '2.1.0', title: 'HF', summary: '', notEvaluated: [], disclaimer: '',
  recommendations: [{ id: 'heart-failure-phenotype', domain: 'diagnosis', priority: 'medium', status: 'review', title: 'HF diagnosis', recommendation: '', rationale: '', patientEvidence: [], nextActions: ['Review diagnosis'], guidelineReferences: [], safetyBoundary: '' }],
}

function Patient({ confirmed = false }: { confirmed?: boolean }) {
  const [answer, setAnswer] = useState<PhenotypeAnswer | undefined>(confirmed ? { answeredOn: '2026-09-17', hfpEfConfirmed: true } : undefined)
  const board = buildHeartFailureBoard(result, 'zh-TW', now)!
  const flow = buildHeartFailureVisitFlow({ result, board, isEnglish: false, now, phenotypeAnswer: answer, includeAllModules: true, patientId: 'p1', decisions: {} })
  return <HeartFailureVisitFlow flow={{ ...flow, readOnly: false }} board={board} now={now} isEnglish={false} expandedId={null} onToggle={() => {}} renderDetail={() => <p>診斷參考資料</p>} packVersion="2.1.0" sectionRecommendations={result.recommendations} phenotypeAnswer={answer} onAnswerPhenotype={setAnswer} />
}

it('requires confirmation, then opens follow-up and lets the physician reopen diagnosis', () => {
  render(<Patient />)
  fireEvent.click(screen.getByRole('button', { name: '確認診斷並進入追蹤' }))
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.queryByTestId('cdss-diagnosis-review')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '確認診斷並進入追蹤' }))
  fireEvent.click(screen.getByRole('button', { name: '確認並進入追蹤' }))
  expect(screen.getByTestId('cdss-followup-priorities')).toBeVisible()
  expect(screen.getByRole('button', { name: '追蹤' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByTestId('cdss-section-module-heart-failure-phenotype')).not.toBeInTheDocument()
  expect(within(screen.getByTestId('cdss-condition-assessment')).queryByText('您懷疑這位病人有心衰竭嗎？')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '診斷' }))
  expect(screen.getByRole('button', { name: '診斷' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('heading', { name: '診斷評估 Diagnosis' })).toBeVisible()
  fireEvent.click(screen.getByTestId('cdss-section-module-heart-failure-phenotype').querySelector('summary')!)
  expect(screen.getByText('診斷參考資料')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '追蹤' }))
  expect(screen.getByRole('heading', { name: '病況追蹤 Follow-up' })).toBeVisible()
  expect(screen.getByTestId('cdss-diagnosis-confirmation')).toHaveTextContent('沿用既有確診')
})

it('opens follow-up immediately for a previously confirmed HFpEF diagnosis', () => {
  render(<Patient confirmed />)
  expect(screen.getByTestId('cdss-followup-priorities')).toBeVisible()
  expect(screen.getByRole('button', { name: '追蹤' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByTestId('cdss-diagnosis-review')).not.toBeInTheDocument()
})
