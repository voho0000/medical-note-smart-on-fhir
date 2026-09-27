/**
 * @jest-environment jsdom
 */
/**
 * A decision taken on the visit decision map carries the pack's action, its
 * response check and its reopen condition. Records written before these
 * fields existed — and records written by the other layouts — read back
 * exactly as they did.
 */
import {
  getPhysicianDecisions,
  physicianDecisionsStorageKey,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { sealAnswers, until, useRealWebCrypto } from '../encrypted-answers.helper'

const AT = new Date('2026-09-27T09:10:00+08:00')

function store() {
  return usePhysicianDecisionsStore.getState()
}

describe('physician decisions · visit map fields', () => {
  useRealWebCrypto()

  beforeEach(() => {
    localStorage.clear()
    usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  })

  it('records the point, the action, its check and its reopen condition', () => {
    store().recordDecision('p1', 'visit:hf:DP-09', {
      decision: 'held',
      packVersion: '2.3.0',
      dp: 'DP-09',
      actionId: 'hold-mra',
      actionLabel: '暫停 MRA',
      responseCheck: { text: 'K、Cr', withinDays: 7 },
      reopenWhen: 'K 回到 <5.0 時重新開始',
    }, AT)
    expect(getPhysicianDecisions('p1')['visit:hf:DP-09']).toEqual({
      decision: 'held',
      reasons: [],
      recordedAt: AT.toISOString(),
      packVersion: '2.3.0',
      dp: 'DP-09',
      actionId: 'hold-mra',
      actionLabel: '暫停 MRA',
      responseCheck: { text: 'K、Cr', withinDays: 7 },
      reopenWhen: 'K 回到 <5.0 時重新開始',
    })
  })

  it('reads an older record without the new fields, and drops a malformed check', async () => {
    await sealAnswers(physicianDecisionsStorageKey('p1'), {
      'heart-failure-mra': { decision: 'deferred', reasons: ['high-potassium'], recordedAt: AT.toISOString(), packVersion: '2.0.0' },
      'visit:hf:DP-08': {
        decision: 'at-max-tolerated', reasons: [], recordedAt: AT.toISOString(), packVersion: '2.3.0',
        dp: 'DP-08', actionId: 'bb-max-tolerated', responseCheck: { text: '心率', withinDays: 'soon' },
      },
    })
    store().hydrate('p1')
    await until(() => Boolean(store().hydratedPatientIds.p1), 'p1 to hydrate')
    expect(getPhysicianDecisions('p1')['heart-failure-mra']).toEqual({
      decision: 'deferred', reasons: ['high-potassium'], recordedAt: AT.toISOString(), packVersion: '2.0.0',
    })
    expect(getPhysicianDecisions('p1')['visit:hf:DP-08']).toEqual({
      decision: 'at-max-tolerated', reasons: [], recordedAt: AT.toISOString(), packVersion: '2.3.0',
      dp: 'DP-08', actionId: 'bb-max-tolerated',
    })
  })
})
