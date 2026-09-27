/**
 * The decision map inside the real view: it replaces every other face of the
 * page while chosen, opens the existing card detail for a point's modules —
 * the companion pack's too — and keeps every card, the completed checks and the
 * handoff reachable. Without a model the page is the three sections it was.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import type { CdssRecommendation, CdssResult } from '@/features/clinical-decision-support/types'
import { p5Model } from './visit-model.fixtures'

// The AI SDK's eventsource-parser needs web streams at module load.
// The rhythm panel reads the ECG reports through the clinical-data hook.
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({ diagnosticReports: [] }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const webStreams = require('node:stream/web')
for (const name of ['TransformStream', 'ReadableStream', 'WritableStream'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[name] === 'undefined') {
    ;(globalThis as Record<string, unknown>)[name] = webStreams[name]
  }
}

function recommendation(id: string, input: Partial<CdssRecommendation> = {}): CdssRecommendation {
  return {
    id,
    moduleName: `模組 ${id}`,
    domain: 'medication',
    priority: 'medium',
    status: 'review',
    title: `決策 ${id}`,
    recommendation: `建議 ${id}`,
    rationale: `理由 ${id}`,
    patientEvidence: [{ label: `依據 ${id}`, value: `數值 ${id}`, factKeys: [] }],
    nextActions: [`下一步 ${id}`],
    guidelineReferences: [],
    safetyBoundary: `邊界 ${id}`,
    ...input,
  }
}

function hfResult(): CdssResult {
  return {
    title: '心衰竭臨床決策支援',
    summary: '',
    packId: 'heart-failure-cdss',
    packVersion: 'test-hf',
    recommendations: [
      recommendation('heart-failure-ras', { status: 'actionable' }),
      recommendation('heart-failure-mra', { status: 'actionable' }),
      recommendation('heart-failure-monitoring', { status: 'review', moduleName: '心衰竭監測' }),
    ],
    automatedChecks: [{ id: 'check-a', label: '已完成檢核 A', value: '完成' }],
    notEvaluated: [],
    disclaimer: '',
    clinicalHandoff: { title: '交班摘要', lines: ['交班內容'], copyText: '交班內容' } as unknown as CdssResult['clinicalHandoff'],
  }
}

function afCompanion(): CdssResult {
  return {
    title: '心房顫動',
    summary: '',
    packId: 'atrial-fibrillation-cdss',
    packVersion: 'test-af',
    recommendations: [recommendation('af-anticoagulation', { moduleName: 'AF 抗凝' })],
    automatedChecks: [],
    notEvaluated: [],
    disclaimer: '',
  }
}

describe('decision map in the view', () => {
  it('draws only the map when chosen, and keeps every card reachable', () => {
    render(
      <ClinicalDecisionSupportView
        result={hfResult()}
        locale="zh-TW"
        patientId="view-patient"
        layout="map"
        visitModel={p5Model()}
        companionResult={afCompanion()}
        physicianDecisions={{}}
        onRecordDecision={jest.fn()}
        onClearDecision={jest.fn()}
        visitAnswers={{}}
        onVisitAnswer={jest.fn()}
      />,
    )
    expect(screen.getByTestId('cdss-visit-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-three-sections')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cdss-hf-visit-flow')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('個案決策總覽')).not.toBeInTheDocument()

    // A point opens the existing card detail for its module.
    const ras = [...document.querySelectorAll<HTMLElement>('button[data-dp="DP-07"]')][0]
    fireEvent.click(ras)
    const detail = screen.getByTestId('cdss-visit-detail')
    expect(within(detail).getByTestId('cdss-visit-detail-module-heart-failure-ras')).toHaveTextContent('依據 heart-failure-ras')

    // The companion's card opens from its point on the heart-failure page.
    const anticoagulation = [...document.querySelectorAll<HTMLElement>('button[data-dp="DP-14"]')][0]
    fireEvent.click(anticoagulation)
    expect(within(screen.getByTestId('cdss-visit-detail')).getByTestId('cdss-visit-detail-module-af-anticoagulation')).toBeInTheDocument()

    // What no point names stays at the foot, with the completed checks and the handoff.
    expect(screen.getByTestId('cdss-visit-other-modules')).toHaveTextContent('心衰竭監測')
    expect(screen.getByTestId('cdss-visit-completed-checks')).toHaveTextContent('已完成檢核 A')
    expect(screen.getByTestId('cdss-clinical-handoff')).toBeInTheDocument()
  })

  it('is the three sections it always was when there is no model', () => {
    // A pack-neutral result: the fallback is the view's own rule, not a pack's.
    render(
      <ClinicalDecisionSupportView
        result={{ ...hfResult(), packId: 'cdss-classic-table-fixture' }}
        locale="zh-TW"
        patientId="view-patient"
        layout="map"
      />,
    )
    expect(screen.queryByTestId('cdss-visit-screen')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-three-sections')).toBeInTheDocument()
  })
})
