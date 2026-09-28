import {
  buildQueueRows,
  buildVisitPlan,
  checkIntervalSuffix,
  decisionFor,
  decisionInputFor,
  dependentDecisionKeys,
  effectiveAnswer,
  visitDecisionKey,
} from '@/features/clinical-decision-support/renderers/visit/visit-decisions'
import type { PhysicianDecisionMap } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { hfAsks, p3Model, p5Model, p6Model } from './visit-model.fixtures'

const NOW = new Date('2026-09-27T10:00:00+08:00')
const TODAY = '2026-09-27T09:30:00+08:00'

function decided(entries: Record<string, { actionId: string; decision?: string; at?: string; responseCheck?: { text: string; interval?: string; withinDays?: number }; actionLabel?: string }>): PhysicianDecisionMap {
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
      responseCheck: { text: 'K、Cr' },
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

  // #166 review: the same action id with a new dose is a new decision.
  it('asks again when the action it answered now says something else', () => {
    const recorded = decided({ 'visit:af:DP-09': { actionId: 'apixaban-5', actionLabel: 'apixaban 5 mg bid' } })
    const point = p3Model().points.find((item) => item.dp === 'DP-09')!
    expect(decisionFor(point, recorded, NOW)?.action.label).toBe('apixaban 5 mg bid')
    // Weight 58 kg and Cr 1.6: the pack now offers 2.5 mg under the same action id.
    const reduced = { ...point, actions: point.actions.map((action) => (action.id === 'apixaban-5' ? { ...action, label: 'apixaban 2.5 mg bid' } : action)) }
    expect(decisionFor(reduced, recorded, NOW)).toBeUndefined()
    // A record from before labels were kept stands on its id.
    expect(decisionFor(reduced, decided({ 'visit:af:DP-09': { actionId: 'apixaban-5' } }), NOW)?.action.label).toBe('apixaban 2.5 mg bid')
  })

  // #166 review: taking back 「開始抗凝」 takes its dose with it.
  it('names the decisions that followed from a step: later steps of its row and its revealed steps', () => {
    const model = p3Model()
    const decisions = decided({
      'visit:af:DP-07': { actionId: 'start-oac' },
      'visit:af:DP-09': { actionId: 'apixaban-5' },
      'visit:af:DP-07:next': { actionId: 'a-revealed-step' },
    })
    const rows = buildQueueRows(model, decisions, NOW)
    expect(dependentDecisionKeys('visit:af:DP-07', rows, decisions).sort()).toEqual(['visit:af:DP-07:next', 'visit:af:DP-09'])
    // The last step has nothing after it.
    expect(dependentDecisionKeys('visit:af:DP-09', rows, decisions)).toEqual([])
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

  // Clinician decision 2026-09-28: 「只說複驗，沒有說要回診」 — a recheck sets
  // no return date; its interval is shown in the guideline's words.
  it('plans the decided checks, timed ones first, and derives no return date', () => {
    const plan = buildVisitPlan(p5Model(), decided({
      'visit:hf:DP-07': { actionId: 'switch-arni', responseCheck: { text: 'K、Cr' } },
      // ESC 2026 S6 prints no time for the β-blocker's heart rate and BP (#33 review).
      'visit:hf:DP-08': { actionId: 'uptitrate-bb', decision: 'dose-adjusted', responseCheck: { text: '心率、血壓' } },
      'visit:hf:DP-09': { actionId: 'start-mra', responseCheck: { text: 'K、Cr、血壓', interval: '1–2 週' } },
      'visit:hf:DP-10': { actionId: 'start-sglt2' },
    }), NOW)
    expect(plan.items.map((item) => item.point.dp)).toEqual(['DP-09', 'DP-07', 'DP-08'])
    expect(plan).not.toHaveProperty('withinDays')
    expect(checkIntervalSuffix(plan.items[0].check, false)).toBe('，1–2 週內')
    expect(checkIntervalSuffix(plan.items[1].check, false)).toBe('')
    expect(checkIntervalSuffix(plan.items[2].check, false)).toBe('')
    // A decision stored before the pack wrote its interval in words reads back its days.
    expect(checkIntervalSuffix({ withinDays: 14 }, false)).toBe('，14 天內')
    expect(buildVisitPlan(p5Model(), {}, NOW)).toEqual({ items: [], notes: [] })
  })

  it('treats a record prefill as the answer until the clinician gives one', () => {
    const [dyspnoea, weight] = hfAsks({ value: 'up', basis: '紀錄：65→68 kg' })
    expect(effectiveAnswer(dyspnoea, {})).toEqual({ prefilled: false })
    expect(effectiveAnswer(weight, {})).toEqual({ value: 'up', prefilled: true })
    expect(effectiveAnswer(weight, { 'weight-trend': 'same' })).toEqual({ value: 'same', prefilled: false })
  })
})
