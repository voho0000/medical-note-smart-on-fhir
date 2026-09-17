import { fireEvent, render, screen, within } from '@testing-library/react'
import { NhiLipidCoverageSummary } from '@/features/clinical-decision-support/renderers/NhiLipidCoverageSummary'
import { useNhiLipidReviewStore } from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'
import type { CdssRecommendation } from '@/features/clinical-decision-support/types'

const recommendation = { id: 'dyslipidemia-risk-and-target', coverageSummary: {
  title: 'Risk', conclusion: '中風險', basis: '兩項危險因子', source: 'Reference', sourceUrl: 'https://example.org/reference',
  rows: [], tiers: [{ id: 'moderate', label: '中風險', criteria: '兩項因子', selected: true }], caveats: ['需核對病史'],
  factors: [{ id: 'hypertension', label: '高血壓', value: '已知病史', state: 'yes', origin: 'record', editable: true }],
  diseaseChecks: [{ id: 'diabetes', label: '糖尿病', value: '無資料', state: 'unknown', origin: 'record', editable: true }],
  metabolicChecks: [{ id: 'met-waist', label: '腰圍', value: '待補', state: 'unknown', origin: 'record', editable: true }],
} } as unknown as CdssRecommendation

test('diagnosis lists all supplied checks and preserves patient-scoped verification', () => {
  useNhiLipidReviewStore.getState().activate('synthetic')
  render(<NhiLipidCoverageSummary recommendation={recommendation} locale="zh-TW" patientId="synthetic" presentation="diagnosis" />)
  const panel = screen.getByTestId('lipid-diagnosis-confirmation')
  expect(panel.querySelectorAll('details')).toHaveLength(3)
  fireEvent.click(within(panel).getAllByText('糖尿病')[0])
  fireEvent.click(within(screen.getByRole('group', { name: '糖尿病' })).getByRole('button', { name: '✓ 符合' }))
  expect(useNhiLipidReviewStore.getState().answers.diabetes).toBe('yes')
})

test('prognosis shows classification basis without duplicating diagnostic inputs', () => {
  render(<NhiLipidCoverageSummary recommendation={recommendation} locale="zh-TW" presentation="prognosis" />)
  expect(screen.getByTestId('lipid-risk-basis')).toHaveTextContent('兩項危險因子')
  expect(screen.queryByRole('group', { name: '糖尿病' })).not.toBeInTheDocument()
})
