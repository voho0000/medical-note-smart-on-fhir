import { render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import type { CdssRecommendation, CdssResult } from '@/features/clinical-decision-support/types'

/**
 * Ten outstanding inputs in one flat list read as ten identical chores. They
 * are three: an order, a measurement, and a question. The summary groups them
 * so a clinician can do all of one kind at once, and leads with what can be
 * done rather than with what is absent.
 */

function recommendation(id: string, input: Partial<CdssRecommendation>): CdssRecommendation {
  return {
    id,
    domain: 'monitoring',
    priority: 'medium',
    status: 'review',
    title: `決策 ${id}`,
    recommendation: `建議 ${id}`,
    rationale: `理由 ${id}`,
    patientEvidence: [],
    nextActions: [`下一步 ${id}`],
    guidelineReferences: [],
    safetyBoundary: `邊界 ${id}`,
    ...input,
  }
}

const result: CdssResult = {
  title: '慢性腎臟病個人化照護指引',
  summary: '測試',
  packId: 'ckd-cdss',
  packVersion: 'test',
  notEvaluated: [],
  disclaimer: '測試',
  automatedChecks: [],
  recommendations: [
    recommendation('act', { status: 'actionable', title: '可立即處理' }),
    recommendation('gaps', {
      status: 'needs-data',
      missingData: [
        '定量 UACR（mg/g；需為有效正值）',
        'Ferritin',
        '標準化診間血壓與量測日期',
        '院外鐵劑與 ESA 使用（資料中未見不等於沒有使用）',
        '疫苗接種紀錄（流感、COVID-19、肺炎鏈球菌）：劑型、序列與是否需追加',
      ],
    }),
  ],
}

describe('clinical summary missing-input groups', () => {
  beforeEach(() => {
    render(<ClinicalDecisionSupportView result={result} locale="zh-TW" />)
  })

  it('sorts each gap into the work that closes it', () => {
    const summary = screen.getByTestId('cdss-clinical-summary')
    const labGroup = screen.getByTestId('cdss-missing-group-lab').parentElement!
    const measureGroup = screen.getByTestId('cdss-missing-group-measure').parentElement!
    const askGroup = screen.getByTestId('cdss-missing-group-ask').parentElement!

    expect(within(labGroup).getByText(/定量 UACR/)).toBeInTheDocument()
    expect(within(labGroup).getByText('Ferritin')).toBeInTheDocument()
    expect(within(measureGroup).getByText(/標準化診間血壓/)).toBeInTheDocument()
    expect(within(askGroup).getByText(/院外鐵劑與 ESA/)).toBeInTheDocument()
    expect(within(askGroup).getByText(/疫苗接種紀錄/)).toBeInTheDocument()
    expect(summary).toHaveTextContent('可開單檢驗')
    expect(summary).toHaveTextContent('診間量測')
    expect(summary).toHaveTextContent('需問診或查紀錄')
  })

  it('puts the recommended actions before the gaps', () => {
    const summary = screen.getByTestId('cdss-clinical-summary')
    const text = summary.textContent ?? ''

    expect(text.indexOf('建議處理')).toBeLessThan(text.indexOf('需補資料'))
  })
})
