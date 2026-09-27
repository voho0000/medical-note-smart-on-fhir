import {
  buildQueueRows,
  buildVisitPlan,
  decisionFor,
  decisionInputFor,
  effectiveAnswer,
  visitDecisionKey,
} from '@/features/clinical-decision-support/renderers/visit/visit-decisions'
import type { PhysicianDecisionMap } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { hfAsks, p3Model, p5Model, p6Model } from './visit-model.fixtures'

const NOW = new Date('2026-09-27T10:00:00+08:00')
const TODAY = '2026-09-27T09:30:00+08:00'

function decided(entries: Record<string, { actionId: string; decision?: string; at?: string; responseCheck?: { text: string; withinDays: number }; actionLabel?: string }>): PhysicianDecisionMap {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, {
    decision: (value.decision ?? 'prescribed') as PhysicianDecisionMap[string]['decision'],
    reasons: [],
    recordedAt: value.at ?? TODAY,
    packVersion: 'test',
    actionId: value.actionId,
    ...(value.actionLabel ? { actionLabel: value.actionLabel } : {}),
    ...(value.responseCheck ? { responseCheck: value.responseCheck } : {}),
  }]))
}

describe('visit decision placement', () => {
  it('keys a decision by the point, not by the surface it was taken on', () => {
    expect(visitDecisionKey({ source: 'hf', dp: 'DP-07' })).toBe('visit:hf:DP-07')
    expect(visitDecisionKey({ source: 'af', dp: 'DP-14' })).toBe('visit:af:DP-14')
  })

  it('writes the pack action, its check and its reopen condition with the decision', () => {
    const point = p6Model().points.find((item) => item.dp === 'DP-09')!
    expect(decisionInputFor(point, point.actions[0], '2.3.0')).toEqual({
      decision: 'held',
      packVersion: '2.3.0',
      dp: 'DP-09',
      actionId: 'hold-mra',
      actionLabel: '暫停 MRA',
      responseCheck: { text: 'K、Cr', withinDays: 7 },
      reopenWhen: 'K 回到 <5.0 時重新開始',
    })
  })

  it('reads a decision only when it is today’s and still answers one of the point’s actions', () => {
    const point = p5Model().points.find((item) => item.dp === 'DP-07')!
    expect(decisionFor(point, decided({ 'visit:hf:DP-07': { actionId: 'switch-arni' } }), NOW)?.action.label).toBe('換 ARNI')
    expect(decisionFor(point, decided({ 'visit:hf:DP-07': { actionId: 'switch-arni', at: '2026-09-20T09:00:00+08:00' } }), NOW)).toBeUndefined()
    expect(decisionFor(point, decided({ 'visit:hf:DP-07': { actionId: 'an-action-the-pack-withdrew' } }), NOW)).toBeUndefined()
    // A module-keyed decision from another layout is not a point decision.
    expect(decisionFor(point, decided({ 'heart-failure-ras': { actionId: 'switch-arni' } }), NOW)).toBeUndefined()
  })

  it('walks a chain in one row only on a decision that carries it on', () => {
    const model = p3Model()
    const pending = buildQueueRows(model, {}, NOW)
    expect(pending).toHaveLength(1)
    expect(pending[0].current?.point.dp).toBe('DP-07')

    const started = buildQueueRows(model, decided({ 'visit:af:DP-07': { actionId: 'start-oac' } }), NOW)
    expect(started).toHaveLength(1)
    // DP-08 waits with nothing to press, so the row skips to the dose.
    expect(started[0].steps.map((step) => step.point.dp)).toEqual(['DP-07', 'DP-09'])
    expect(started[0].current?.point.dp).toBe('DP-09')

    const deferred = buildQueueRows(model, decided({ 'visit:af:DP-07': { actionId: 'defer-oac', decision: 'deferred' } }), NOW)
    expect(deferred[0].steps.map((step) => step.point.dp)).toEqual(['DP-07'])
    expect(deferred[0].current).toBeUndefined()
  })

  it('plans the decided checks earliest first, and the return from the earliest', () => {
    const plan = buildVisitPlan(p5Model(), decided({
      'visit:hf:DP-07': { actionId: 'switch-arni', responseCheck: { text: 'K、Cr、血壓', withinDays: 14 } },
      'visit:hf:DP-08': { actionId: 'uptitrate-bb', decision: 'dose-adjusted', responseCheck: { text: '心率、血壓', withinDays: 10 } },
      'visit:hf:DP-10': { actionId: 'start-sglt2' },
    }), NOW)
    expect(plan.items.map((item) => item.point.dp)).toEqual(['DP-08', 'DP-07'])
    expect(plan.withinDays).toBe(10)
    expect(buildVisitPlan(p5Model(), {}, NOW)).toEqual({ items: [], notes: [] })
  })

  it('treats a record prefill as the answer until the clinician gives one', () => {
    const [dyspnoea, weight] = hfAsks({ value: 'up', basis: '紀錄：65→68 kg' })
    expect(effectiveAnswer(dyspnoea, {})).toEqual({ prefilled: false })
    expect(effectiveAnswer(weight, {})).toEqual({ value: 'up', prefilled: true })
    expect(effectiveAnswer(weight, { 'weight-trend': 'same' })).toEqual({ value: 'same', prefilled: false })
  })
})
