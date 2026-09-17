import { fireEvent, render, screen, within } from '@testing-library/react'
import { NhiLipidCoverageSummary } from '@/features/clinical-decision-support/renderers/NhiLipidCoverageSummary'
import { LipidModuleSections } from '@/features/clinical-decision-support/renderers/LipidModuleSections'
import { useNhiLipidReviewStore } from '@/features/clinical-decision-support/stores/nhi-lipid-review.store'
import type { CdssRecommendation } from '@/features/clinical-decision-support/types'

const recommendation = { id: 'dyslipidemia-risk-and-target', status: 'review', priority: 'routine', domain: 'target', title: 'Risk review', nextActions: [], coverageSummary: {
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

test('lipid follow-up and diagnosis switch without clearing physician review', () => {
  useNhiLipidReviewStore.getState().activate('synthetic-switch')
  render(<LipidModuleSections recommendations={[recommendation]} locale="zh-TW" patientId="synthetic-switch" isEnglish={false} renderDetail={() => null} />)
  fireEvent.click(screen.getByTestId('cdss-section-disclosure-diagnosis').querySelector('summary')!)
  expect(screen.getByTestId('lipid-follow-up')).toBeInTheDocument()
  expect(screen.queryByTestId('lipid-diagnosis-confirmation')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '診斷', exact: true }))
  fireEvent.click(within(screen.getByRole('group', { name: '糖尿病' })).getByRole('button', { name: '✓ 符合' }))
  fireEvent.click(screen.getByRole('button', { name: '追蹤', exact: true }))
  expect(screen.getByRole('button', { name: '追蹤', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByTestId('lipid-follow-up').querySelector('details')).not.toHaveAttribute('open')
  expect(useNhiLipidReviewStore.getState().answers.diabetes).toBe('yes')
  fireEvent.click(screen.getByRole('button', { name: '診斷', exact: true }))
  expect(useNhiLipidReviewStore.getState().answers.diabetes).toBe('yes')
})

test.each(['歷史值達門檻與否不能代表今日；先複驗', '目前有降脂處方；最新值已達標，不可當作未治療基線', '待補資料'])('follow-up preserves pack assessment %s without interpreting the numeric value', assessment => {
  const fixture = { ...recommendation, coverageSummary: {
    rows: [{ label: '目前分層', value: '中風險' }, { label: '起始門檻', value: '≥115' }, { label: '治療標的', value: 'LDL-C <115 mg/dL' }, { label: '最新 LDL-C', value: '90 mg/dL · 2018-02-12' }, { label: '基線', value: '待核對' }, { label: '門檻／達標判讀', value: assessment }],
    caveats: [], source: 'Reference', sourceUrl: 'https://example.org',
  } } as unknown as CdssRecommendation
  render(<NhiLipidCoverageSummary recommendation={fixture} locale="zh-TW" presentation="follow-up" />)
  expect(screen.getByTestId('lipid-follow-up')).toHaveTextContent(assessment)
  expect(screen.getByTestId('lipid-follow-up')).toHaveTextContent('2018-02-12')
  expect(screen.getByTestId('lipid-follow-up')).toHaveTextContent('LDL-C <115 mg/dL')
})
