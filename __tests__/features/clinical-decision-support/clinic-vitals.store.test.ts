/**
 * @jest-environment jsdom
 */
/**
 * The visit record: a partial statement, merged.
 *
 * The store this replaced took a whole `ClinicVitals` on every save, so the
 * blood-pressure form wrote back the record it had opened with — and the NYHA
 * grade, the signs and the compensation judgement answered in between were
 * gone. What is held here is the opposite promise: a save states only the
 * fields it names, an unchanged value does not re-date itself, and 「未評估」 is
 * an answer the screen can show that the pack still reads as unknown.
 */
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import {
  clinicVitalsStorageKey,
  congestionGroupAnswer,
  getClinicVitals,
  useClinicVitalsStore,
} from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'

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

describe('the clinic visit record', () => {
  beforeEach(() => {
    localStorage.clear()
    useClinicVitalsStore.setState({ byPatientId: {} })
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

  it('keeps one patient\'s answers out of the next patient\'s chart', () => {
    store().setVitals('p1', { nyhaClass: 'III' }, MORNING)
    store().hydrate('p2')

    expect(getClinicVitals('p2').nyhaClass).toBeUndefined()
    expect(localStorage.getItem(clinicVitalsStorageKey('p1'))).toContain('III')
    expect(localStorage.getItem(clinicVitalsStorageKey('p2'))).toBeNull()
  })

  it('reads last visit\'s answers back for the same patient', () => {
    store().setVitals('p1', { nyhaClass: 'II' }, MORNING)
    useClinicVitalsStore.setState({ byPatientId: {} })

    store().hydrate('p1')
    expect(getClinicVitals('p1').nyhaClass).toEqual({
      value: 'II',
      modifiedAt: MORNING.toISOString(),
    })
  })

  it('clears one patient without touching another', () => {
    store().setVitals('p1', { nyhaClass: 'II' }, MORNING)
    store().setVitals('p2', { nyhaClass: 'IV' }, MORNING)

    store().clearVitals('p1')
    expect(getClinicVitals('p1').nyhaClass).toBeUndefined()
    expect(getClinicVitals('p2').nyhaClass?.value).toBe('IV')
  })
})
