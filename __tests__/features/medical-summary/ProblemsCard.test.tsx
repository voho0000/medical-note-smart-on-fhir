import { render, screen, within } from '@testing-library/react'
import { ProblemsCard } from '@/features/medical-summary/components/ProblemsCard'
import type { MedicalSummaryResult, SummaryProblem } from '@/src/core/entities/medical-summary.entity'

const sourceIndex: MedicalSummaryResult['sourceIndex'] = [
  { key: 'C1', num: 1, verified: true, resourceType: 'Condition', resourceId: 'cond-1', display: 'Type 2 diabetes' },
  { key: 'L1', num: 2, verified: true, resourceType: 'DiagnosticReport', resourceId: 'rep-1', display: 'HbA1c', date: '2026-04-18' },
  { key: 'M1', num: 3, verified: true, resourceType: 'MedicationRequest', resourceId: 'med-1', display: 'Metformin 500mg' },
  { key: 'E1', num: 4, verified: true, resourceType: 'Encounter', resourceId: 'enc-1', display: 'Endocrinology clinic' },
]

function renderCard(problem: SummaryProblem) {
  const result = { headline: '', problems: [problem], medicationEducation: [], sourceIndex } as unknown as MedicalSummaryResult
  return render(
    <ProblemsCard
      result={result}
      title="問題清單與負責院所"
      subtitle=""
      metaLabel="{count} 項"
      basisLabel="依據:"
      organizationLatestLabel="該院最近紀錄"
      metricNeedsReviewLabel="需核對"
      inferredLabel="由慢箋推定"
      medicationInferredLabel="用藥推定"
      singleValueLabel="單次數值"
      verifyLabel="待核對"
      legendLabel="= 待核對"
      showAllLabel="顯示全部 {count} 項"
      showLessLabel="收合"
      typeLabel={(resourceType) => resourceType ?? ''}
      unverifiedLabel="來源不存在"
      sourceTypeMismatchLabel="來源類型不符"
    />,
  )
}

describe('ProblemsCard', () => {
  it('puts each column\'s own citation beside the claim it supports', () => {
    renderCard({
      label: 'Type 2 diabetes mellitus',
      basis: '1 claim record',
      kind: 'careplan',
      metric: 'HbA1c 6.6% (single)',
      metricMeta: '2026-04-18',
      managedBy: '甲醫學中心',
      managedByDate: '2026-06-12',
      medications: 'Metformin 500mg',
      sourceKeys: ['C1', 'L1', 'M1'],
      basisSourceKeys: ['C1'],
      metricSourceKeys: ['L1'],
      medicationSourceKeys: ['M1'],
      managedBySourceKey: 'E1',
    })

    expect(within(screen.getByText(/1 claim record/)).getByRole('button', { name: /^1 · Condition/ })).toBeInTheDocument()
    expect(within(screen.getByText(/HbA1c 6\.6%/)).getByRole('button', { name: /^2 · DiagnosticReport/ })).toBeInTheDocument()
    expect(within(screen.getByText(/甲醫學中心/)).getByRole('button', { name: /^4 · Encounter/ })).toBeInTheDocument()
    expect(within(screen.getByText(/Metformin 500mg/)).getByRole('button', { name: /^3 · MedicationRequest/ })).toBeInTheDocument()
    // No row-level bundle duplicating the column citations.
    expect(screen.queryByRole('button', { name: /^1,2,3/ })).not.toBeInTheDocument()
  })

  it('says when the date is the facility\'s latest record rather than this problem\'s visit', () => {
    renderCard({
      label: 'Heart failure',
      kind: 'other',
      managedBy: '甲醫學中心 心臟科',
      managedByDate: '2026-06-01',
      managedByScope: 'organization',
      sourceKeys: ['C1'],
      basisSourceKeys: ['C1'],
      managedBySourceKey: 'E1',
    })
    expect(screen.getByText(/甲醫學中心 心臟科 · 該院最近紀錄 2026-06-01/)).toBeInTheDocument()
  })

  it('marks a metric whose trend could not be verified', () => {
    renderCard({
      label: 'Arterial stiffness', kind: 'other', metric: 'baPWV 1544；1547 cm/s', metricNeedsReview: true,
      sourceKeys: ['L1'], basisSourceKeys: ['L1'], metricSourceKeys: ['L1'],
    })
    expect(screen.getByText(/baPWV 1544；1547 cm\/s/)).toHaveTextContent('需核對')
  })

  it('says when the managing visit was inferred from refills', () => {
    renderCard({
      label: 'T2DM', kind: 'diagnosis', managedBy: '示範甲診所', managedByDate: '2026-01-02', managedByScope: 'inferred',
      sourceKeys: ['M1'], basisSourceKeys: ['M1'], managedBySourceKey: 'E1',
    })
    expect(screen.getByText(/示範甲診所 · 2026-01-02（由慢箋推定）/)).toBeInTheDocument()
  })

  it('tags a problem that rests on medicines alone', () => {
    renderCard({
      label: 'Type 2 diabetes mellitus', kind: 'medication', inferredFromMedication: true,
      sourceKeys: ['M1'], basisSourceKeys: ['M1'],
    })
    expect(screen.getByText(/Type 2 diabetes mellitus/)).toHaveTextContent('用藥推定')
  })

  it('keeps the single row-level citation for a legacy result', () => {
    renderCard({
      label: 'Type 2 diabetes mellitus',
      kind: 'careplan',
      metric: 'HbA1c 6.6%',
      sourceKeys: ['C1', 'L1'],
    })

    expect(screen.getByRole('button', { name: /^1,2 · / })).toBeInTheDocument()
    expect(within(screen.getByText(/HbA1c 6\.6%/)).queryByRole('button')).not.toBeInTheDocument()
  })
})
