import { render, screen, within } from '@testing-library/react'
import { NhiLipidCoverageSummary } from '@/features/clinical-decision-support/renderers/NhiLipidCoverageSummary'
import type { CdssRecommendation } from '@/features/clinical-decision-support/types'

test('renders pack-owned coverage separately from the clinical recommendation and keeps all six tiers accessible', () => {
  const rec = {
    id: 'dyslipidemia-risk-and-target',
    title: 'Supplementary clinical goal',
    coverageSummary: {
      title: '健保給付分層與治療標的', conclusion: '申報支持至少中風險；待核對', source: '健保表一', sourceUrl: 'https://www.nhi.gov.tw/',
      rows: [{ label: '起始治療', value: 'LDL-C ≥115 mg/dL' }, { label: '最新 LDL-C', value: '123 mg/dL · 2018-02-12' }],
      tiers: ['極高', '非常高', '高', '中', '低', '0 項'].map((label, i) => ({ id: String(i), label, selected: i === 3, status: i === 3 ? '目前最低已知' : '待核對', initiation: '由規則提供', target: '由規則提供', criteria: '需核對' })),
      factors: [{ label: '抽菸', value: '未找到可判讀資料' }], caveats: ['歷史數據需複驗'],
    },
  } as unknown as CdssRecommendation
  render(<NhiLipidCoverageSummary recommendation={rec} locale="zh-TW" />)
  expect(screen.getByText('LDL-C ≥115 mg/dL')).toBeInTheDocument()
  expect(screen.getByText('123 mg/dL · 2018-02-12')).toBeInTheDocument()
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(7)
  expect(screen.getByText('歷史數據需複驗')).toBeInTheDocument()
  expect(screen.queryByText('Supplementary clinical goal')).not.toBeInTheDocument()
})

test('does not add a coverage surface to another module or older package output', () => {
  const { container } = render(<NhiLipidCoverageSummary recommendation={{ id: 'heart-failure-phenotype' } as CdssRecommendation} locale="zh-TW" />)
  expect(container).toBeEmptyDOMElement()
})
