import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'

const profile: CdssPatientProfile = {
  id: 'p1',
  facts: {
    bloodPressure: { zh: '142/84 mmHg（2026-04-18）', en: '142/84 mmHg (2026-04-18)', unit: 'mmHg', date: '2026-04-18' },
    potassium: { zh: '4.2 mmol/L', en: '4.2 mmol/L', numericValue: 4.2, date: '2026-07-06' },
  },
  freshnessContexts: {
    bloodPressure: { factKey: 'bloodPressure', date: '2026-04-18', ageDays: 140, intervalDays: 90, state: 'overdue' },
    heartRate: { factKey: 'heartRate', intervalDays: 90, state: 'missing' },
  },
}

describe('applyClinicVitals', () => {
  it('returns the profile untouched when nothing was measured', () => {
    expect(applyClinicVitals(profile, undefined)).toBe(profile)
    expect(applyClinicVitals(profile, { measuredOn: '2026-09-05' })).toBe(profile)
  })

  it('replaces the record facts with today\'s measurements, dated and marked as entered', () => {
    const next = applyClinicVitals(profile, {
      systolic: 128,
      diastolic: 76,
      heartRate: 72,
      bodyWeight: 73.5,
      measuredOn: '2026-09-05',
    })

    expect(next.facts.bloodPressure).toEqual({
      zh: '128/76 mmHg（2026-09-05 門診輸入）',
      en: '128/76 mmHg (2026-09-05, entered in clinic)',
      unit: 'mmHg',
      date: '2026-09-05',
    })
    expect(next.facts.heartRate).toMatchObject({ numericValue: 72, unit: 'bpm', date: '2026-09-05' })
    expect(next.facts.bodyWeight).toMatchObject({ numericValue: 73.5, unit: 'kg', date: '2026-09-05' })
    // Untouched facts stay.
    expect(next.facts.potassium).toBe(profile.facts.potassium)
    // Freshness follows: the record's window is kept, the state is current.
    expect(next.freshnessContexts?.bloodPressure).toEqual({
      factKey: 'bloodPressure', date: '2026-09-05', ageDays: 0, intervalDays: 90, state: 'current',
    })
    expect(next.freshnessContexts?.bodyWeight).toMatchObject({ intervalDays: 30, state: 'current' })
  })

  it('needs both halves of a blood pressure and ignores non-positive numbers', () => {
    const next = applyClinicVitals(profile, { systolic: 128, heartRate: 0, bodyWeight: 70, measuredOn: '2026-09-05' })

    expect(next.facts.bloodPressure).toBe(profile.facts.bloodPressure)
    expect(next.facts.heartRate).toBeUndefined()
    expect(next.facts.bodyWeight?.numericValue).toBe(70)
  })
})
