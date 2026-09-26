import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { HeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/HeartFailureVisitFlow'
import { DecisionMapCard } from '@/features/clinical-decision-support/renderers/DecisionMapCard'
import { buildHeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import {
  HF_DECISION_MAP_GROUPS,
  buildDecisionMap,
  type DecisionMapGroupDef,
} from '@/features/clinical-decision-support/renderers/heart-failure-decision-map'
import { mergeAfIntoHeartFailure } from '@/features/clinical-decision-support/utils/merge-af-into-hf'
import type { CdssRecommendation, CdssResult } from '@/features/clinical-decision-support/types'
import type { PhysicianDecisionMap } from '@/features/clinical-decision-support/stores/physician-decisions.store'

const now = new Date('2026-09-26T10:00:00+08:00')
const rec = (id: string, extra: Partial<CdssRecommendation> = {}): CdssRecommendation => ({
  id, moduleName: id, domain: 'medication', priority: 'routine', status: 'review', title: `${id} title`,
  recommendation: '', rationale: '', patientEvidence: [], nextActions: [`${id} next`],
  guidelineReferences: [], safetyBoundary: '', ...extra,
})
const result = (recommendations: CdssRecommendation[], packId = 'heart-failure-cdss'): CdssResult => ({
  packId, packVersion: '2.0.0', title: 'HF', summary: '', notEvaluated: [], disclaimer: '', recommendations,
})

const hf = result([
  rec('heart-failure-mra', { status: 'actionable' }),
  rec('heart-failure-sglt2', { status: 'no-action' }),
  rec('heart-failure-monitoring', { domain: 'monitoring', status: 'needs-data' }),
  rec('antithrombotic-coordination', { status: 'no-action', nextActions: ['HF 協調原文'] }),
])
const af = result([
  rec('af-documented-cha2ds2-vasc', { domain: 'target', status: 'review', title: 'CHA₂DS₂-VA 3 分', moduleName: '血栓風險' }),
  rec('af-anticoagulation-concordance', {
    status: 'actionable',
    title: '達抗凝門檻，目前未使用口服抗凝',
    moduleName: '抗凝適應症',
    nextActions: ['依風險、瓣膜狀態與出血情況討論抗凝'],
  }),
  rec('af-anticoagulant-selection-safety', { domain: 'safety', status: 'review', moduleName: '抗凝選藥與瓣膜' }),
  rec('antithrombotic-coordination', { status: 'actionable', nextActions: ['AF 協調原文'] }),
  rec('af-rate-control-and-lvef-safety', { domain: 'safety', status: 'needs-data', moduleName: '心率控制' }),
], 'atrial-fibrillation-cdss')
const merged = mergeAfIntoHeartFailure(hf, () => af)

const cellOf = (model: ReturnType<typeof buildDecisionMap>, dp: string) => (
  model.groups.flatMap((group) => group.cells).find((cell) => cell.point.dp === dp)!
)

describe('buildDecisionMap', () => {
  it('lays out the groups of the specification ⓪–⑥: 36 decision points plus DP-03', () => {
    expect(HF_DECISION_MAP_GROUPS.map((group) => group.marker)).toEqual(['⓪', '①', '②', '③', '④', '⑤', '⑥'])
    const cells = HF_DECISION_MAP_GROUPS.flatMap((group) => group.points)
    expect(cells).toHaveLength(37)
    expect(new Set(cells.map((point) => point.dp)).size).toBe(37)
    const model = buildDecisionMap(hf)
    expect(model.total).toBe(36)
    expect(cellOf(model, 'DP-03').point.notDecision).toBe(true)
  })

  it('combines module statuses: actionable, then data needed, then review, then done', () => {
    const groups: DecisionMapGroupDef[] = [{
      id: 't', marker: 'T', label: { zh: '測試', en: 'Test' },
      points: [
        { dp: 'A', semanticId: 'a', label: { zh: 'A', en: 'A' }, moduleIds: ['m-done', 'm-act', 'm-data'] },
        { dp: 'B', semanticId: 'b', label: { zh: 'B', en: 'B' }, moduleIds: ['m-review', 'm-data'] },
        { dp: 'C', semanticId: 'c', label: { zh: 'C', en: 'C' }, moduleIds: ['m-done', 'm-review'] },
        { dp: 'D', semanticId: 'd', label: { zh: 'D', en: 'D' }, moduleIds: ['m-done', 'm-done-2'] },
        { dp: 'E', semanticId: 'e', label: { zh: 'E', en: 'E' }, moduleIds: ['m-absent'] },
        { dp: 'F', semanticId: 'f', label: { zh: 'F', en: 'F' }, moduleIds: [], notYetIncluded: true },
      ],
    }]
    const model = buildDecisionMap(result([
      rec('m-act', { status: 'actionable' }),
      rec('m-data', { status: 'needs-data' }),
      rec('m-review', { status: 'review' }),
      rec('m-done', { status: 'no-action' }),
      rec('m-done-2', { status: 'no-action' }),
    ]), groups)
    expect(model.groups[0].cells.map((cell) => cell.state)).toEqual([
      'actionable', 'needs-data', 'review', 'no-action', 'not-applicable', 'not-included',
    ])
    // The hint is the pack's own next step on the module that set the state.
    expect(cellOf(model, 'A').hint).toBe('m-act next')
    expect(cellOf(model, 'A').recommendations.map((item) => item.id)).toEqual(['m-done', 'm-act', 'm-data'])
    expect(cellOf(model, 'E').hint).toBeUndefined()
    expect(model.counts).toMatchObject({ actionable: 1, 'needs-data': 1, review: 1, 'no-action': 1, 'not-applicable': 1, 'not-included': 1 })
  })

  it('marks decision points no module covers yet as 尚未納入', () => {
    const model = buildDecisionMap(hf)
    for (const dp of ['DP-18', 'DP-29', 'DP-30', 'DP-26', 'DP-12', 'DP-16', 'DP-36', 'DP-19', 'DP-33', 'DP-31', 'DP-32', 'DP-35']) {
      expect(cellOf(model, dp).state).toBe('not-included')
    }
    expect(cellOf(model, 'DP-09').state).toBe('actionable')
    expect(cellOf(model, 'DP-10').state).toBe('no-action')
    expect(cellOf(model, 'DP-17').state).toBe('needs-data')
  })

  it('shows the AF pack status on ⑥ once AF is merged, and not before', () => {
    const before = buildDecisionMap(hf)
    expect(cellOf(before, 'DP-14').state).toBe('not-applicable')
    expect(cellOf(before, 'DP-28').state).toBe('not-applicable')
    const after = buildDecisionMap(merged)
    expect(cellOf(after, 'DP-14').state).toBe('actionable')
    expect(cellOf(after, 'DP-14').hint).toBe('依風險、瓣膜狀態與出血情況討論抗凝')
    expect(cellOf(after, 'DP-14').recommendations.map((item) => item.id)).toEqual([
      'af-documented-cha2ds2-vasc', 'af-anticoagulation-concordance', 'af-anticoagulant-selection-safety',
    ])
    expect(cellOf(after, 'DP-28').state).toBe('needs-data')
  })

  it('keeps one antithrombotic-coordination card, the HF one', () => {
    const cell = cellOf(buildDecisionMap(merged), 'DP-23')
    expect(cell.recommendations).toHaveLength(1)
    expect(cell.state).toBe('no-action')
    expect(cell.hint).toBe('HF 協調原文')
  })
})

function Harness({ onRecord = jest.fn(), packResult = merged }: { onRecord?: jest.Mock; packResult?: CdssResult }) {
  const [decisions, setDecisions] = useState<PhysicianDecisionMap>({})
  const board = buildHeartFailureBoard(packResult, 'zh-TW', now)!
  const flow = buildHeartFailureVisitFlow({
    board, result: packResult, isEnglish: false, now, decisions, patientId: 'synthetic',
    phenotypeAnswer: { hfSuspicion: 'suspected', answeredOn: '2026-09-26' },
  })
  return <HeartFailureVisitFlow board={board} flow={flow} result={packResult} now={now} isEnglish={false}
    expandedId={null} onToggle={() => {}} packVersion="2.0.0"
    renderDetail={(recommendation) => <div data-testid={`detail-${recommendation.id}`}>{recommendation.title}</div>}
    onRecordDecision={(id, input) => {
      onRecord(id, input)
      setDecisions({ ...decisions, [id]: { ...input, reasons: input.reasons ?? [], recordedAt: now.toISOString() } })
    }} />
}

describe('DecisionMapCard', () => {
  it('starts folded, with the summary line naming the counts', () => {
    render(<Harness />)
    const map = screen.getByTestId('cdss-hf-decision-map')
    expect(map).not.toHaveAttribute('open')
    expect(within(map).queryByTestId('cdss-hf-map-cell-DP-14')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-hf-decision-map-summary')).toHaveTextContent('36 個決策點 · 需處理 2 · 需補資料 3 · 需確認 0')
  })

  it('sits directly under 「今天要決定」', () => {
    render(<Harness />)
    const focus = screen.getByTestId('cdss-hf-today-focus')
    expect(focus.nextElementSibling).toBe(screen.getByTestId('cdss-hf-decision-map'))
  })

  it('opens a point to its full cards and decision buttons, and records a decision from the map', () => {
    const onRecord = jest.fn()
    render(<Harness onRecord={onRecord} />)
    fireEvent.click(screen.getByTestId('cdss-hf-decision-map-toggle'))
    const cell = screen.getByTestId('cdss-hf-map-cell-DP-14')
    expect(cell).toHaveAttribute('data-state', 'actionable')
    expect(within(cell).getByText('AF 抗凝')).toBeVisible()
    expect(within(cell).getByText('需處理')).toBeVisible()
    fireEvent.click(cell)
    expect(cell).toHaveAttribute('aria-expanded', 'true')
    const region = screen.getByTestId('cdss-hf-map-region-DP-14')
    expect(within(region).getByTestId('detail-af-anticoagulation-concordance')).toHaveTextContent('達抗凝門檻，目前未使用口服抗凝')
    expect(within(region).getByTestId('detail-af-documented-cha2ds2-vasc')).toHaveTextContent('CHA₂DS₂-VA 3 分')
    expect(within(region).getByText('AF 抗凝適應症')).toBeVisible()
    const controls = within(region).getByTestId('cdss-hf-map-decision-af-anticoagulation-concordance')
    expect(within(controls).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['已開立', '劑量調整', '禁忌', '暫緩', '病人意願'])
    fireEvent.click(within(controls).getByRole('button', { name: '已開立' }))
    expect(onRecord).toHaveBeenCalledWith('af-anticoagulation-concordance', expect.objectContaining({ decision: 'prescribed' }))
    expect(within(screen.getByTestId('cdss-hf-map-region-DP-14'))
      .getByTestId('cdss-hf-map-decision-recorded-af-anticoagulation-concordance')).toHaveTextContent('已開立')
    fireEvent.click(screen.getByTestId('cdss-hf-map-cell-DP-14'))
    expect(screen.queryByTestId('cdss-hf-map-region-DP-14')).not.toBeInTheDocument()
  })

  it('lists the merged AF anticoagulation card in 「今天要決定」 and the full list', () => {
    render(<Harness />)
    expect(within(screen.getByTestId('cdss-hf-today-focus'))
      .getByTestId('cdss-hf-today-focus-row-af-anticoagulation-concordance')).toBeVisible()
    expect(screen.getByTestId('cdss-hf-decision-af-anticoagulation-concordance')).toBeInTheDocument()
  })

  it('says why a point has no card, without decision buttons', () => {
    render(<DecisionMapCard result={hf} isEnglish={false} renderDetail={() => null} />)
    fireEvent.click(screen.getByTestId('cdss-hf-decision-map-toggle'))
    fireEvent.click(screen.getByTestId('cdss-hf-map-cell-DP-12'))
    expect(screen.getByTestId('cdss-hf-map-region-DP-12')).toHaveTextContent('此決策點尚未有對應模組。')
    fireEvent.click(screen.getByTestId('cdss-hf-map-cell-DP-14'))
    expect(screen.queryByTestId('cdss-hf-map-region-DP-12')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-hf-map-region-DP-14')).toHaveTextContent('不適用或尚未納入')
  })

  it('opens a card without decision buttons where the layout records none', () => {
    render(<DecisionMapCard result={merged} isEnglish={false}
      renderDetail={(recommendation) => <div data-testid={`detail-${recommendation.id}`} />} />)
    fireEvent.click(screen.getByTestId('cdss-hf-decision-map-toggle'))
    fireEvent.click(screen.getByTestId('cdss-hf-map-cell-DP-09'))
    const region = screen.getByTestId('cdss-hf-map-region-DP-09')
    expect(within(region).getByTestId('detail-heart-failure-mra')).toBeInTheDocument()
    expect(within(region).queryByRole('button')).not.toBeInTheDocument()
  })
})
