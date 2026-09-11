/**
 * @jest-environment jsdom
 */
/**
 * What the clinician decided about each recommendation.
 *
 * Three promises are held here. A decision is kept per patient, so one chart's
 * 「已開立」 never appears on the next. It records which rules version it was
 * made against, because a row whose wording changed between releases is not
 * necessarily the row that was decided. And clearing one leaves the rest of
 * the visit alone.
 */
import {
  getPhysicianDecisions,
  physicianDecisionsStorageKey,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'

const AT = new Date('2026-09-11T14:11:00+08:00')

function store() {
  return usePhysicianDecisionsStore.getState()
}

describe('physician decisions', () => {
  beforeEach(() => {
    localStorage.clear()
    usePhysicianDecisionsStore.setState({ byPatientId: {} })
  })

  it('records a decision with its reasons, note and rules version', () => {
    store().recordDecision('p1', 'heart-failure-mra', {
      decision: 'deferred',
      reasons: ['high-potassium', 'symptomatic-hypotension'],
      note: '先加 MRA 觀察血壓',
      packVersion: '1.13.0',
    }, AT)

    expect(getPhysicianDecisions('p1')['heart-failure-mra']).toEqual({
      decision: 'deferred',
      reasons: ['high-potassium', 'symptomatic-hypotension'],
      note: '先加 MRA 觀察血壓',
      recordedAt: AT.toISOString(),
      packVersion: '1.13.0',
    })
  })

  it('replaces one module\'s decision without touching the others', () => {
    store().recordDecision('p1', 'heart-failure-mra', { decision: 'prescribed', packVersion: '1.13.0' }, AT)
    store().recordDecision('p1', 'heart-failure-sglt2', { decision: 'prescribed', packVersion: '1.13.0' }, AT)

    store().clearDecision('p1', 'heart-failure-mra')
    expect(getPhysicianDecisions('p1')['heart-failure-mra']).toBeUndefined()
    expect(getPhysicianDecisions('p1')['heart-failure-sglt2']?.decision).toBe('prescribed')
  })

  it('keeps one patient\'s decisions out of the next patient\'s chart', () => {
    store().recordDecision('p1', 'heart-failure-mra', { decision: 'prescribed', packVersion: '1.13.0' }, AT)
    store().hydrate('p2')

    expect(getPhysicianDecisions('p2')).toEqual({})
    expect(localStorage.getItem(physicianDecisionsStorageKey('p2'))).toBeNull()
  })

  it('reads last visit\'s decisions back for the same patient', () => {
    store().recordDecision('p1', 'heart-failure-sglt2', {
      decision: 'prescribed',
      note: '維持',
      packVersion: '1.13.0',
    }, AT)
    usePhysicianDecisionsStore.setState({ byPatientId: {} })

    store().hydrate('p1')
    expect(getPhysicianDecisions('p1')['heart-failure-sglt2']).toMatchObject({
      decision: 'prescribed',
      note: '維持',
      recordedAt: AT.toISOString(),
    })
  })

  it('ignores a stored value that is not a decision this host knows', () => {
    localStorage.setItem(
      physicianDecisionsStorageKey('p1'),
      JSON.stringify({ 'heart-failure-mra': { decision: 'teleported', reasons: [] } }),
    )
    store().hydrate('p1')

    expect(getPhysicianDecisions('p1')).toEqual({})
  })
})
