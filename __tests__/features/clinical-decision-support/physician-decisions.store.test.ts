/**
 * @jest-environment jsdom
 */
/**
 * What the clinician decided about each recommendation.
 *
 * Four promises are held here. A decision is kept per patient, so one chart's
 * 「已開立」 never appears on the next. It records which rules version it was
 * made against, because a row whose wording changed between releases is not
 * necessarily the row that was decided. Clearing one leaves the rest of the
 * visit alone. And what reaches storage is ciphertext under this tab's session
 * key — 「這位病人決定了什麼」 is a clinical statement about a named patient, and
 * it used to be readable in plain text by the next person at the workstation.
 */
import {
  getPhysicianDecisions,
  physicianDecisionsStorageKey,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import {
  expectSealedEnvelope,
  sealAnswers,
  storedCiphertext,
  until,
  useRealWebCrypto,
} from './encrypted-answers.helper'

const AT = new Date('2026-09-11T14:11:00+08:00')

function store() {
  return usePhysicianDecisionsStore.getState()
}

function hydrated(patientId: string): boolean {
  return Boolean(usePhysicianDecisionsStore.getState().hydratedPatientIds[patientId])
}

describe('physician decisions', () => {
  useRealWebCrypto()

  beforeEach(() => {
    localStorage.clear()
    usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
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

  it('keeps one patient\'s decisions out of the next patient\'s chart', async () => {
    store().recordDecision('p1', 'heart-failure-mra', { decision: 'prescribed', packVersion: '1.13.0' }, AT)
    await storedCiphertext(physicianDecisionsStorageKey('p1'))

    store().hydrate('p2')
    await until(() => hydrated('p2'), 'p2 to hydrate')

    expect(getPhysicianDecisions('p2')).toEqual({})
    expect(localStorage.getItem(physicianDecisionsStorageKey('p2'))).toBeNull()
  })

  it('stores ciphertext, never the decision itself', async () => {
    store().recordDecision('p1', 'heart-failure-mra', {
      decision: 'contraindicated',
      reasons: ['high-potassium'],
      note: '先加 MRA 觀察血壓',
      packVersion: '1.13.0',
    }, AT)
    const raw = await storedCiphertext(physicianDecisionsStorageKey('p1'))

    expectSealedEnvelope(raw, [
      'heart-failure-mra',
      'contraindicated',
      'high-potassium',
      '先加 MRA 觀察血壓',
      'packVersion',
    ])
  })

  it('reads last visit\'s decisions back for the same patient', async () => {
    store().recordDecision('p1', 'heart-failure-sglt2', {
      decision: 'prescribed',
      note: '維持',
      packVersion: '1.13.0',
    }, AT)
    await storedCiphertext(physicianDecisionsStorageKey('p1'))
    usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(getPhysicianDecisions('p1')['heart-failure-sglt2']).toMatchObject({
      decision: 'prescribed',
      note: '維持',
      recordedAt: AT.toISOString(),
    })
  })

  it('writes nothing while the read is still in flight', async () => {
    store().recordDecision('p1', 'heart-failure-sglt2', { decision: 'prescribed', packVersion: '1.13.0' }, AT)
    const sealed = await storedCiphertext(physicianDecisionsStorageKey('p1'))
    usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    expect(hydrated('p1')).toBe(false)
    expect(localStorage.getItem(physicianDecisionsStorageKey('p1'))).toBe(sealed)

    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(getPhysicianDecisions('p1')['heart-failure-sglt2']?.decision).toBe('prescribed')
    expect(localStorage.getItem(physicianDecisionsStorageKey('p1'))).toBe(sealed)
  })

  it('drops a read that resolves after the chart has moved on', async () => {
    store().recordDecision('p1', 'heart-failure-mra', { decision: 'prescribed', packVersion: '1.13.0' }, AT)
    store().recordDecision('p2', 'heart-failure-sglt2', { decision: 'deferred', packVersion: '1.13.0' }, AT)
    await storedCiphertext(physicianDecisionsStorageKey('p1'))
    await storedCiphertext(physicianDecisionsStorageKey('p2'))
    usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    store().hydrate('p2')
    await until(() => hydrated('p2'), 'p2 to hydrate')

    expect(usePhysicianDecisionsStore.getState().byPatientId.p1).toBeUndefined()
    expect(hydrated('p1')).toBe(false)
    expect(getPhysicianDecisions('p2')['heart-failure-sglt2']?.decision).toBe('deferred')
  })

  it('ignores a stored value that is not a decision this host knows', async () => {
    // A record sealed by a build that published a decision kind this one does
    // not render. It decrypts; it is the parsing below the envelope that has to
    // refuse it, rather than a card rendering 「teleported」.
    await sealAnswers(physicianDecisionsStorageKey('p1'), {
      'heart-failure-mra': { decision: 'teleported', reasons: [] },
    })

    store().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(getPhysicianDecisions('p1')).toEqual({})
  })

  it('leaves a chart nobody has decided on unwritten, and open in the same tick', () => {
    store().hydrate('first-visit')

    expect(hydrated('first-visit')).toBe(true)
    expect(localStorage.getItem(physicianDecisionsStorageKey('first-visit'))).toBeNull()
  })
})
