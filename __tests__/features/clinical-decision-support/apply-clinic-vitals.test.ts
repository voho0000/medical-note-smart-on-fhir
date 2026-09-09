import {
  applyClinicVitals,
  clinicEntryContexts,
} from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
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
  it('returns the profile untouched when nothing was entered', () => {
    expect(applyClinicVitals(profile, undefined)).toBe(profile)
    expect(applyClinicVitals(profile, { measuredOn: '2026-09-05' })).toBe(profile)
    expect(applyClinicVitals(profile, { measuredOn: '2026-09-05', entries: {} })).toBe(profile)
  })

  it('replaces the record facts with today\'s measurements, dated and marked as entered', () => {
    const next = applyClinicVitals(profile, {
      entries: {
        bloodPressure: { value: 128, diastolic: 76, enteredAt: '2026-09-05' },
        heartRate: { value: 72, enteredAt: '2026-09-05' },
        bodyWeight: { value: 73.5, enteredAt: '2026-09-05' },
      },
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

  /**
   * A height is written exactly like a weight, in the adapter's own unit, so
   * the pack's BMI cannot depend on which of the two wrote it. No window is
   * invented for it: the adapter attaches none, because an adult's height does
   * not go stale.
   */
  it('writes an entered height as centimetres, with no window of its own', () => {
    const next = applyClinicVitals(profile, {
      entries: { height: { value: 150, enteredAt: '2026-09-09' } },
      measuredOn: '2026-09-09',
    })
    expect(next.facts.height).toEqual({
      zh: '150 cm（2026-09-09 門診輸入）',
      en: '150 cm (2026-09-09, entered in clinic)',
      numericValue: 150,
      unit: 'cm',
      date: '2026-09-09',
    })
    expect(next.freshnessContexts?.height).toBeUndefined()
  })

  it('keeps each entry on its own date, so one correction never re-dates another', () => {
    const next = applyClinicVitals(profile, {
      entries: {
        bodyWeight: { value: 71, enteredAt: '2026-09-01' },
        potassium: { value: 5.1, enteredAt: '2026-09-09' },
      },
      measuredOn: '2026-09-09',
    })

    expect(next.facts.bodyWeight?.date).toBe('2026-09-01')
    expect(next.facts.potassium?.date).toBe('2026-09-09')
  })

  it('writes an entered laboratory value in the adapter\'s own wording', () => {
    const next = applyClinicVitals(profile, {
      entries: {
        potassium: { value: 5.4, enteredAt: '2026-09-09' },
        sodium: { value: 133, enteredAt: '2026-09-09' },
        eGFR: { value: 41, enteredAt: '2026-09-09' },
        NTproBNP: { value: 2100, enteredAt: '2026-09-09' },
      },
      measuredOn: '2026-09-09',
    })

    expect(next.facts.potassium).toEqual({
      zh: '5.4 mmol/L（2026-09-09 門診輸入）',
      en: '5.4 mmol/L (2026-09-09, entered in clinic)',
      numericValue: 5.4,
      unit: 'mmol/L',
      date: '2026-09-09',
    })
    expect(next.facts.sodium).toMatchObject({ numericValue: 133, unit: 'mmol/L' })
    expect(next.facts.eGFR?.zh).toBe('41 mL/min/1.73m²（2026-09-09 門診輸入）')
    expect(next.facts.NTproBNP?.zh).toBe('2100 pg/mL（2026-09-09 門診輸入）')
    // Every one of them is current again, on the record's own window.
    expect(next.freshnessContexts?.potassium).toMatchObject({ intervalDays: 90, state: 'current' })
    expect(next.freshnessContexts?.NTproBNP).toMatchObject({ intervalDays: 180, state: 'current' })
  })

  it('appends an entered LVEF to the trajectory, leaving the record\'s points where they were', () => {
    const withTrend: CdssPatientProfile = {
      ...profile,
      facts: {
        ...profile.facts,
        LVEF: {
          zh: '63.6%（2026-06-24）',
          en: '63.6% (2026-06-24)',
          numericValue: 63.6,
          unit: '%',
          date: '2026-06-24',
          sources: [{ resourceType: 'Observation', resourceId: 'obs-2', date: '2026-06-24', value: 63.6, unit: '%' }],
        },
        LVEFTrend: {
          zh: '2024-02-02 38% → 2026-06-24 63.6%',
          en: '2024-02-02 38% → 2026-06-24 63.6%',
          numericValue: 63.6,
          unit: '%',
          date: '2026-06-24',
          sources: [
            { resourceType: 'Observation', resourceId: 'obs-1', date: '2024-02-02', value: 38, unit: '%' },
            { resourceType: 'Observation', resourceId: 'obs-2', date: '2026-06-24', value: 63.6, unit: '%' },
          ],
        },
      },
    }

    const next = applyClinicVitals(withTrend, {
      entries: { LVEF: { value: 35, enteredAt: '2026-09-09' } },
      measuredOn: '2026-09-09',
    })

    expect(next.facts.LVEF).toEqual({
      zh: '35%（2026-09-09 門診輸入）',
      en: '35% (2026-09-09, entered in clinic)',
      numericValue: 35,
      unit: '%',
      date: '2026-09-09',
    })
    // The prior points are untouched, and the entered reading is the last one.
    expect(next.facts.LVEFTrend?.sources?.map((source) => source.value)).toEqual([38, 63.6, 35])
    expect(next.facts.LVEFTrend?.zh).toBe(
      '2024-02-02 38% → 2026-06-24 63.6% → 2026-09-09 35%（2026-09-09 門診輸入）',
    )
    // Nothing pretends the entered point came out of the record.
    expect(next.facts.LVEFTrend?.sources?.at(-1)?.resourceId).toBe('clinic-entry:LVEF:2026-09-09')
  })

  it('builds a two-point trajectory from a record that held only one reading', () => {
    const single: CdssPatientProfile = {
      ...profile,
      facts: {
        ...profile.facts,
        LVEF: {
          zh: '63%（2026-06-11）',
          en: '63% (2026-06-11)',
          numericValue: 63,
          unit: '%',
          date: '2026-06-11',
          sources: [{ resourceType: 'Observation', resourceId: 'obs-9', date: '2026-06-11', value: 63, unit: '%' }],
        },
      },
    }
    const next = applyClinicVitals(single, {
      entries: { LVEF: { value: 35, enteredAt: '2026-09-09' } },
      measuredOn: '2026-09-09',
    })
    expect(next.facts.LVEFTrend?.sources?.map((source) => source.value)).toEqual([63, 35])

    // A record with no ejection fraction at all gets no invented trajectory.
    const bare = applyClinicVitals(profile, {
      entries: { LVEF: { value: 35, enteredAt: '2026-09-09' } },
      measuredOn: '2026-09-09',
    })
    expect(bare.facts.LVEFTrend).toBeUndefined()
    expect(bare.facts.LVEF?.numericValue).toBe(35)
  })

  it('needs both halves of a blood pressure and ignores non-positive numbers', () => {
    const next = applyClinicVitals(profile, {
      entries: {
        bloodPressure: { value: 128, enteredAt: '2026-09-05' },
        heartRate: { value: 0, enteredAt: '2026-09-05' },
        bodyWeight: { value: 70, enteredAt: '2026-09-05' },
      },
      measuredOn: '2026-09-05',
    })

    expect(next.facts.bloodPressure).toBe(profile.facts.bloodPressure)
    expect(next.facts.heartRate).toBeUndefined()
    expect(next.facts.bodyWeight?.numericValue).toBe(70)
  })

  it('writes the signs seen today as a clinic examination the congestion table reads', () => {
    const next = applyClinicVitals(profile, {
      symptoms: ['pitting-edema', 'jvp', 'rales'],
      measuredOn: '2026-09-08',
    })

    expect(next.facts.clinicCongestionExam).toEqual({
      zh: '門診理學檢查（2026-09-08 門診輸入）',
      en: 'Clinic examination (2026-09-08, entered in clinic)',
      date: '2026-09-08',
      textEvidence: { direction: 'supports', matchedTerms: ['pitting-edema', 'jvp', 'rales'] },
    })
    // Only the measured vitals get a freshness context; the examination is a fact alone.
    expect(next.freshnessContexts?.bloodPressure).toBe(profile.freshnessContexts?.bloodPressure)
    // No answer, no fact: the default is silence, not a negative finding.
    expect(applyClinicVitals(profile, { measuredOn: '2026-09-08', symptoms: [] }).facts.clinicCongestionExam)
      .toBeUndefined()
  })

  it('keeps 「過去曾有」 in its own fact, because it is not today\'s examination', () => {
    const next = applyClinicVitals(profile, {
      symptoms: ['dyspnea'],
      priorSymptoms: ['orthopnea', 'pitting-edema'],
      measuredOn: '2026-09-08',
    })

    expect(next.facts.clinicCongestionExam?.textEvidence?.matchedTerms).toEqual(['dyspnea'])
    expect(next.facts.clinicPriorHfSymptoms).toEqual({
      zh: '過去曾有的心衰竭症狀／徵象（2026-09-08 門診輸入）',
      en: 'Prior heart-failure symptoms or signs (2026-09-08, entered in clinic)',
      date: '2026-09-08',
      textEvidence: { direction: 'supports', matchedTerms: ['orthopnea', 'pitting-edema'] },
    })
  })

  it('writes the rhythm stated in the room, and dates it today', () => {
    const sinus = applyClinicVitals(profile, { rhythm: 'sinus', measuredOn: '2026-09-08' })
    expect(sinus.facts.ecgRhythm).toMatchObject({
      zh: '竇性心律（2026-09-08 門診輸入）',
      date: '2026-09-08',
      textEvidence: { direction: 'against', matchedTerms: [] },
    })
    expect(sinus.freshnessContexts?.ecgRhythm).toMatchObject({ intervalDays: 180, state: 'current' })

    const af = applyClinicVitals(profile, { rhythm: 'atrial-fibrillation', measuredOn: '2026-09-08' })
    expect(af.facts.ecgRhythm?.textEvidence).toEqual({
      direction: 'supports',
      matchedTerms: ['atrial-fibrillation-or-flutter'],
    })
  })
})

describe('clinicEntryContexts', () => {
  it('carries the record value each entry replaced, read off the record profile', () => {
    const contexts = clinicEntryContexts(
      profile,
      {
        entries: {
          potassium: { value: 5.4, enteredAt: '2026-09-09' },
          bloodPressure: { value: 128, diastolic: 76, enteredAt: '2026-09-09' },
          // The record holds no NT-proBNP: the entry stands with nothing behind it.
          NTproBNP: { value: 900, enteredAt: '2026-09-09' },
        },
        measuredOn: '2026-09-09',
      },
      'zh-TW',
    )

    expect(contexts.potassium).toEqual({
      factKey: 'potassium',
      enteredAt: '2026-09-09',
      recordValue: '4.2 mmol/L',
      recordDate: '2026-07-06',
    })
    expect(contexts.bloodPressure?.recordValue).toBe('142/84 mmHg（2026-04-18）')
    expect(contexts.NTproBNP).toEqual({ factKey: 'NTproBNP', enteredAt: '2026-09-09' })
  })

  it('is empty when nothing was entered', () => {
    expect(clinicEntryContexts(profile, undefined, 'zh-TW')).toEqual({})
    expect(clinicEntryContexts(profile, { measuredOn: '2026-09-09' }, 'zh-TW')).toEqual({})
    const english = clinicEntryContexts(
      profile,
      { entries: { potassium: { value: 5.4, enteredAt: '2026-09-09' } }, measuredOn: '2026-09-09' },
      'en',
    )
    expect(english.potassium?.recordValue).toBe('4.2 mmol/L')
  })
})
