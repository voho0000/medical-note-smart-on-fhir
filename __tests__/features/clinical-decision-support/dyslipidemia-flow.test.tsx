import { fireEvent, render, screen, within } from '@testing-library/react'
import { HYPERLIPIDEMIA_GUIDELINE_PACK, type CdssPatientProfile } from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { buildDyslipidemiaBoard } from '@/features/clinical-decision-support/renderers/dyslipidemia-board'

const f = (v: number | string) => ({ zh: String(v), en: String(v), ...(typeof v === 'number' ? { numericValue: v } : {}) })
function result(facts: CdssPatientProfile['facts'] = {}) {
  return HYPERLIPIDEMIA_GUIDELINE_PACK.build({ locale: 'zh-TW', profile: {
    id: 'synthetic-lipid-test', evaluatedAt: '2026-09-12T00:00:00Z',
    facts: { ascvdDiagnosis: f('ASCVD'), LDL: f(118), medicationListOverview: f('complete'), ...facts },
  } })
}

describe('dyslipidemia visit flow', () => {
  it('keeps all real pack modules reachable, including completed checks', () => {
    const r = result({ LDL: f(45), HDL: f(50), triglycerides: f(100), totalCholesterol: f(150), lipoproteinA: f(20), apolipoproteinB: f(65) })
    render(<ClinicalDecisionSupportView result={r} locale="zh-TW" />)
    expect(screen.getByTestId('cdss-lipid-visit-flow')).toBeInTheDocument()
    const rows = [...r.recommendations, ...(r.automatedChecks ?? []).flatMap(c => c.recommendation ? [c.recommendation] : [])]
    for (const rec of rows) {
      const row = screen.getByTestId(`cdss-lipid-row-${rec.id}`)
      fireEvent.click(within(row).getAllByRole('button')[0])
      expect(screen.getByTestId(`cdss-semantic-card-${rec.id}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('cdss-clinical-summary')).not.toBeInTheDocument()
  })
  it('surfaces review-status TG risk before the risk/target section', () => {
    const r = result({ triglycerides: f(1200) })
    expect(buildDyslipidemiaBoard(r, 'zh-TW')?.alerts[0]).toMatchObject({ status: 'review', priority: 'high' })
    render(<ClinicalDecisionSupportView result={r} locale="zh-TW" />)
    expect(screen.getByTestId('cdss-lipid-alerts').compareDocumentPosition(screen.getByTestId('cdss-lipid-risk')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByTestId('cdss-lipid-row-dyslipidemia-severe-triglycerides')).toHaveLength(1)
  })
  it('does not confuse missing values with at-goal results', () => {
    const r = HYPERLIPIDEMIA_GUIDELINE_PACK.build({ locale: 'zh-TW', profile: { id: 'empty', facts: {} } })
    render(<ClinicalDecisionSupportView result={r} locale="zh-TW" />)
    expect(screen.getByTestId('cdss-lipid-headline-value')).toHaveTextContent('未取得')
    expect(screen.getByTestId('cdss-lipid-metric-nonHDL')).toHaveTextContent('同日 TC 與 HDL-C 可算出')
  })
  it('records decisions through the same host callback as HF without changing the clinical status', () => {
    const record = jest.fn()
    render(<ClinicalDecisionSupportView result={result()} locale="zh-TW" onRecordDecision={record} />)
    const row = screen.getByTestId('cdss-lipid-row-dyslipidemia-lipid-lowering-therapy')
    fireEvent.change(within(row).getByLabelText('本次決策'), { target: { value: 'deferred' } })
    fireEvent.change(within(row).getByLabelText('原因／備註（選填）'), { target: { value: '先確認耐受性' } })
    fireEvent.click(within(row).getByRole('button', { name: '記錄' }))
    expect(record).toHaveBeenCalledWith('dyslipidemia-lipid-lowering-therapy', expect.objectContaining({ decision: 'deferred', note: '先確認耐受性', packVersion: '0.4.0-poc' }))
    expect(within(row).getByText('可立即處理')).toBeInTheDocument()
  })
  it('shows the new risk evidence table in decision detail', () => {
    render(<ClinicalDecisionSupportView result={result({ myocardialInfarctionDiagnosis: f('MI'), ischemicStrokeDiagnosis: f('stroke') })} locale="zh-TW" />)
    const row = screen.getByTestId('cdss-lipid-row-dyslipidemia-risk-and-target')
    fireEvent.click(within(row).getAllByRole('button')[0])
    expect(screen.getByTestId('cdss-evidence-table-dyslipidemia-risk-and-target-lipid-very-high-risk')).toBeInTheDocument()
    expect(within(row).getAllByText(/<55/).length).toBeGreaterThan(0)
  })
  it('keeps classic layout available and refuses other pack ids', () => {
    const r = result()
    render(<ClinicalDecisionSupportView result={r} locale="en" layout="classic" />)
    expect(screen.queryByTestId('cdss-lipid-visit-flow')).not.toBeInTheDocument()
    expect(buildDyslipidemiaBoard({ ...r, packId: 'heart-failure-cdss' }, 'en')).toBeUndefined()
  })
})
