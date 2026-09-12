/**
 * @jest-environment jsdom
 */
/**
 * The visit record: a partial statement, merged — and sealed.
 *
 * The store this replaced took a whole `ClinicVitals` on every save, so the
 * blood-pressure form wrote back the record it had opened with — and the NYHA
 * grade, the signs and the compensation judgement answered in between were
 * gone. What is held here is the opposite promise: a save states only the
 * fields it names, an unchanged value does not re-date itself, and 「未評估」 is
 * an answer the screen can show that the pack still reads as unknown.
 *
 * The second promise is newer. What reaches storage is ciphertext under this
 * tab's session key, so 「這位病人答了什麼」 is not readable by the next person
 * at the workstation; reading it back is therefore asynchronous, and the store
 * has to be able to say 「還沒讀到」 without writing an empty record over a
 * stored one.
 */
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import {
  clinicVitalsStorageKey,
  congestionGroupAnswer,
  getClinicVitals,
  useClinicVitalsStore,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'
import {
  expectSealedEnvelope,
  storedCiphertext,
  until,
  useRealWebCrypto,
} from './encrypted-answers.helper'

const MORNING = new Date('2026-09-11T09:00:00+08:00')
const AFTERNOON = new Date('2026-09-11T14:02:00+08:00')

const PROFILE: CdssPatientProfile = {
  id: 'p1',
  evaluatedAt: '2026-09-11T14:05:00+08:00',
  facts: {},
}

function store() {
  return useClinicVitalsStore.getState()
}

function hydrated(patientId: string): boolean {
  return Boolean(useClinicVitalsStore.getState().hydratedPatientIds[patientId])
}

describe('the clinic visit record', () => {
  useRealWebCrypto()

  beforeEach(() => {
    localStorage.clear()
    useClinicVitalsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  })

  it('merges a statement instead of replacing the record', () => {
    store().setVitals('p1', { nyhaClass: 'II' }, MORNING)
    store().setVitals('p1', { signAnswers: { 'pitting-edema': 'absent' } }, MORNING)
    store().setVitals('p1', { compensationStatus: 'compensated' }, MORNING)
    // The blood-pressure form saves last, as it does in the room.
    store().setVitals('p1', {
      entries: { systolic: { value: 118 }, diastolic: { value: 72 } },
    }, AFTERNOON)

    const vitals = getClinicVitals('p1')
    expect(vitals.nyhaClass?.value).toBe('II')
    expect(vitals.signAnswers['pitting-edema'].value).toBe('absent')
    expect(vitals.compensationStatus?.value).toBe('compensated')
    expect(vitals.entries.systolic?.value).toBe(118)
  })

  it('leaves a field\'s stamp alone when the value does not change', () => {
    store().setVitals('p1', { nyhaClass: 'II' }, MORNING)
    const first = getClinicVitals('p1').nyhaClass?.modifiedAt

    store().setVitals('p1', { nyhaClass: 'II' }, AFTERNOON)
    expect(getClinicVitals('p1').nyhaClass?.modifiedAt).toBe(first)

    store().setVitals('p1', { nyhaClass: 'III' }, AFTERNOON)
    expect(getClinicVitals('p1').nyhaClass?.modifiedAt).toBe(AFTERNOON.toISOString())
  })

  it('dates a measurement by the day it was taken and the moment it was typed', () => {
    store().setVitals('p1', {
      entries: { bodyWeight: { value: 74.5, measuredOn: '2026-09-08' } },
    }, AFTERNOON)

    expect(getClinicVitals('p1').entries.bodyWeight).toEqual({
      value: 74.5,
      measuredOn: '2026-09-08',
      modifiedAt: AFTERNOON.toISOString(),
    })
  })

  it('keeps 「未評估」 and 「沒問」 apart, and hands the pack neither', () => {
    store().setVitals('p1', {
      nyhaClass: 'not-assessed',
      signAnswers: { orthopnea: 'not-assessed' },
      compensationStatus: 'not-assessed',
    }, MORNING)

    const answered = getClinicVitals('p1')
    // The screen can say the question was put…
    expect(answered.nyhaClass?.value).toBe('not-assessed')
    expect(congestionGroupAnswer(answered, 'orthopnea-pnd')).toBe('not-assessed')
    // …and the pack still reads nothing at all.
    expect(applyClinicVitals(PROFILE, answered)).toBe(PROFILE)

    // `null` is the other thing: the answer is withdrawn, not recorded.
    store().setVitals('p1', { nyhaClass: null }, AFTERNOON)
    expect(getClinicVitals('p1').nyhaClass).toBeUndefined()
  })

  it('writes every term of a congestion group in one answer', () => {
    store().setCongestionGroup('p1', 'orthopnea-pnd', 'absent', MORNING)

    const vitals = getClinicVitals('p1')
    expect(vitals.signAnswers.orthopnea.value).toBe('absent')
    expect(vitals.signAnswers['paroxysmal-nocturnal-dyspnea'].value).toBe('absent')
    // 「無」 is a finding: it reaches the pack as a negated term.
    expect(applyClinicVitals(PROFILE, vitals).facts.clinicCongestionExam?.textEvidence)
      .toMatchObject({ direction: 'against' })
  })

  it('keeps one patient\'s answers out of the next patient\'s chart', async () => {
    store().setVitals('p1', { nyhaClass: 'III' }, MORNING)
    await storedCiphertext(clinicVitalsStorageKey('p1'))

    store().hydrate('p2')
    await until(() => hydrated('p2'), 'p2 to hydrate')

    expect(getClinicVitals('p2').nyhaClass).toBeUndefined()
    expect(localStorage.getItem(clinicVitalsStorageKey('p2'))).toBeNull()
  })

  it('stores ciphertext, never the answers themselves', async () => {
    store().setVitals('p1', {
      nyhaClass: 'III',
      signAnswers: { 'pitting-edema': 'present' },
      entries: { bodyWeight: { value: 74.5, measuredOn: '2026-09-08' } },
    }, MORNING)
    const raw = await storedCiphertext(clinicVitalsStorageKey('p1'))

    // Every one of these was readable in the plaintext record CodeQL flagged.
    expectSealedEnvelope(raw, [
      'pitting-edema',
      'not-assessed',
      'nyhaClass',
      'signAnswers',
      'bodyWeight',
      '2026-09-08',
      '74.5',
    ])
  })

  it('reads last visit\'s answers back for the same patient', async () => {
    store().setVitals('p1', { nyhaClass: 'II' }, MORNING)
    await storedCiphertext(clinicVitalsStorageKey('p1'))
    useClinicVitalsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(getClinicVitals('p1').nyhaClass).toEqual({
      value: 'II',
      modifiedAt: MORNING.toISOString(),
    })
  })

  it('writes nothing while the read is still in flight', async () => {
    store().setVitals('p1', { nyhaClass: 'II' }, MORNING)
    const sealed = await storedCiphertext(clinicVitalsStorageKey('p1'))
    useClinicVitalsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    store().hydrate('p1')
    // 「還沒讀到」 is not 「沒有答案」: nothing is in memory yet, the chart is
    // not marked hydrated, and — the part that matters — the stored record is
    // untouched rather than overwritten with an empty one.
    expect(hydrated('p1')).toBe(false)
    expect(useClinicVitalsStore.getState().byPatientId.p1).toBeUndefined()
    expect(localStorage.getItem(clinicVitalsStorageKey('p1'))).toBe(sealed)

    await until(() => hydrated('p1'), 'p1 to hydrate')
    expect(getClinicVitals('p1').nyhaClass?.value).toBe('II')
    expect(localStorage.getItem(clinicVitalsStorageKey('p1'))).toBe(sealed)
  })

  it('writes nothing for a chart that has never been answered for', () => {
    store().hydrate('first-visit')

    // Nothing stored means nothing to decrypt, so the questions open in the
    // same tick rather than behind 「讀取中」 — and no key is created for a
    // patient nobody has answered for.
    expect(hydrated('first-visit')).toBe(true)
    expect(localStorage.getItem(clinicVitalsStorageKey('first-visit'))).toBeNull()
  })

  it('drops a read that resolves after the chart has moved on', async () => {
    store().setVitals('p1', { nyhaClass: 'III' }, MORNING)
    store().setVitals('p2', { nyhaClass: 'I' }, MORNING)
    await storedCiphertext(clinicVitalsStorageKey('p1'))
    await storedCiphertext(clinicVitalsStorageKey('p2'))
    useClinicVitalsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })

    // The clinician opens p1 and moves to p2 before the decryption lands.
    store().hydrate('p1')
    store().hydrate('p2')
    await until(() => hydrated('p2'), 'p2 to hydrate')

    // p1's answers must not arrive into the chart that is now on screen, and
    // must not be left in memory for a patient nobody is looking at.
    expect(useClinicVitalsStore.getState().byPatientId.p1).toBeUndefined()
    expect(hydrated('p1')).toBe(false)
    expect(getClinicVitals('p2').nyhaClass?.value).toBe('I')

    // Going back to p1 reads it again, so nothing was lost by dropping it.
    store().hydrate('p1')
    await until(() => hydrated('p1'), 'p1 to hydrate on return')
    expect(getClinicVitals('p1').nyhaClass?.value).toBe('III')
  })

  it('clears one patient without touching another', async () => {
    store().setVitals('p1', { nyhaClass: 'II' }, MORNING)
    store().setVitals('p2', { nyhaClass: 'IV' }, MORNING)
    await storedCiphertext(clinicVitalsStorageKey('p1'))
    await storedCiphertext(clinicVitalsStorageKey('p2'))

    store().clearVitals('p1')
    expect(getClinicVitals('p1').nyhaClass).toBeUndefined()
    expect(getClinicVitals('p2').nyhaClass?.value).toBe('IV')
    expect(localStorage.getItem(clinicVitalsStorageKey('p1'))).toBeNull()
    expect(localStorage.getItem(clinicVitalsStorageKey('p2'))).not.toBeNull()
  })

  it('does not let an encryption still in flight undo a clear', async () => {
    // 清除 lands immediately; the save it cancels is still encrypting. The
    // record must not come back when that finishes.
    store().setVitals('p1', { nyhaClass: 'II' }, MORNING)
    store().clearVitals('p1')
    // A later save that does land is the clock: once its ciphertext is there,
    // the cancelled one has had its turn at the same queue.
    store().setVitals('p2', { nyhaClass: 'IV' }, MORNING)
    await storedCiphertext(clinicVitalsStorageKey('p2'))

    expect(localStorage.getItem(clinicVitalsStorageKey('p1'))).toBeNull()
  })
})
