import type { CdssRecommendation } from '@/features/clinical-decision-support/types'
import {
  TODAY_FOCUS_ROUTINE_LIMIT,
  buildTodayFocus,
  type VisitActionGroup,
  type VisitActionGroupId,
  type VisitActionRow,
} from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'

function row(id: string, group: VisitActionGroupId, extra: Partial<VisitActionRow> = {}): VisitActionRow {
  const recommendation = { id, status: group === 'safety' ? 'actionable' : group } as unknown as CdssRecommendation
  return {
    recommendation,
    headline: `${id} next step`,
    moduleName: id,
    status: recommendation.status,
    isSafety: group === 'safety',
    decisionKind: 'medication',
    ...extra,
  }
}

function groups(spec: Partial<Record<VisitActionGroupId, VisitActionRow[]>>): VisitActionGroup[] {
  return (Object.entries(spec) as [VisitActionGroupId, VisitActionRow[]][]).map(([id, rows]) => ({
    id, label: id, rows, collapsedByDefault: id === 'no-action',
  }))
}

const decided = { decision: { decision: 'prescribed', reasons: [], recordedAt: '2026-09-26T01:00:00Z', packVersion: 't' } } as Partial<VisitActionRow>

describe('buildTodayFocus', () => {
  it('lists every undecided safety row, never capped', () => {
    const safety = Array.from({ length: 6 }, (_, i) => row(`s${i}`, 'safety'))
    const focus = buildTodayFocus(groups({ safety, actionable: [row('a1', 'actionable')] }))
    expect(focus.safety.map((r) => r.recommendation.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5'])
    expect(focus.routine.map((r) => r.recommendation.id)).toEqual(['a1'])
  })

  it('caps routine rows at three, actionable before data-needed before review', () => {
    const focus = buildTodayFocus(groups({
      review: [row('r1', 'review')],
      'needs-data': [row('n1', 'needs-data'), row('n2', 'needs-data')],
      actionable: [row('a1', 'actionable'), row('a2', 'actionable')],
    }))
    expect(TODAY_FOCUS_ROUTINE_LIMIT).toBe(3)
    expect(focus.routine.map((r) => r.recommendation.id)).toEqual(['a1', 'a2', 'n1'])
    expect(focus.remaining).toBe(2)
  })

  it('leaves out decided rows, medication-record rows and rows without decisions', () => {
    const focus = buildTodayFocus(groups({
      safety: [row('s1', 'safety', decided)],
      actionable: [
        row('a1', 'actionable', { ...decided, decisionSource: 'medication-record' }),
        row('a2', 'actionable', { decisionKind: 'none' }),
        row('a3', 'actionable'),
      ],
      'no-action': [row('x1', 'no-action')],
    }))
    expect(focus.safety).toEqual([])
    expect(focus.routine.map((r) => r.recommendation.id)).toEqual(['a3'])
    expect(focus.decided).toBe(2)
    expect(focus.decidable).toBe(4) // x1 is decidable but no-action rows never enter the focus
  })

  it('is empty when nothing is pending', () => {
    const focus = buildTodayFocus(groups({ 'no-action': [row('x1', 'no-action')] }))
    expect(focus).toMatchObject({ safety: [], routine: [], remaining: 0 })
  })
})

describe('safety headline in the focus', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildHeartFailureVisitFlow } = require('@/features/clinical-decision-support/renderers/heart-failure-visit-flow')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildHeartFailureBoard } = require('@/features/clinical-decision-support/renderers/heart-failure-board')
  const now = new Date('2026-09-26T10:00:00+08:00')
  const rec = (id: string, extra: Record<string, unknown>) => ({
    id, moduleName: id, domain: 'safety', priority: 'high', status: 'actionable', title: id,
    recommendation: '', rationale: '', patientEvidence: [], nextActions: [id],
    guidelineReferences: [], safetyBoundary: '', ...extra,
  })
  it('keeps the pack step when FMT safety is actionable for a potassium tier', () => {
    const step = '盡速複驗 K；暫不加量；複驗仍 >5.5 時依成分暫時減量或停用 MRA／RAS 抑制劑。'
    const result = {
      packId: 'heart-failure-cdss', packVersion: 't', title: 'HF', summary: '', notEvaluated: [], disclaimer: '',
      recommendations: [rec('heart-failure-fmt-safety', { nextActions: [step, '補齊心率'], missingData: ['心率'] })],
    }
    const board = buildHeartFailureBoard(result, 'zh-TW', now)
    const flow = buildHeartFailureVisitFlow({ board, result, isEnglish: false, now, decisions: {}, patientId: 'synthetic' })
    const focus = buildTodayFocus(flow.actionGroups)
    expect(focus.safety[0]?.headline).toBe(step)
  })
})
