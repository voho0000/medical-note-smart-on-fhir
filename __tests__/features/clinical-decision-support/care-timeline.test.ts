import { buildCareTimeline } from '@/features/clinical-decision-support/renderers/care-timeline'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'

type Facts = CdssPatientProfile['facts']

function lvefTrend(readings: readonly (readonly [string, number])[]): Facts[string] {
  return {
    zh: readings.map(([date, value]) => `${date} ${value}%`).join(' → '),
    en: readings.map(([date, value]) => `${date} ${value}%`).join(' → '),
    unit: '%',
    sources: readings.map(([date, value]) => ({
      resourceType: 'Observation' as const,
      resourceId: `lvef-${date}`,
      date,
      value,
    })),
  }
}

describe('buildCareTimeline', () => {
  it('is absent when the record dates fewer than two things', () => {
    expect(buildCareTimeline(undefined, false)).toBeUndefined()
    expect(buildCareTimeline({}, false)).toBeUndefined()
    expect(buildCareTimeline({
      LVEF: {
        zh: '32%（2026-07-14）',
        en: '32% (2026-07-14)',
        numericValue: 32,
        sources: [{ resourceType: 'Observation', resourceId: 'lvef-1', date: '2026-07-14', value: 32 }],
      },
    }, false)).toBeUndefined()
  })

  it('puts the LVEF trajectory, the diagnosis code and the prescription span on one dated line', () => {
    const timeline = buildCareTimeline({
      LVEFTrend: lvefTrend([['2024-03-02', 38], ['2025-06-11', 45], ['2026-07-14', 52]]),
      heartFailureDiagnosis: {
        zh: '慢性收縮性心臟衰竭',
        en: 'Chronic systolic heart failure',
        sources: [{
          resourceType: 'Condition',
          resourceId: 'cond-1',
          date: '2024-03-10',
          value: 'I50.22 慢性收縮性心臟衰竭',
        }],
      },
      sglt2Therapy: {
        zh: '目前用藥中：Dapagliflozin 10mg',
        en: 'Currently taking: Dapagliflozin 10mg',
        sources: [
          { resourceType: 'MedicationRequest', resourceId: 'rx-1', date: '2024-04-01' },
          { resourceType: 'MedicationRequest', resourceId: 'rx-2', date: '2026-08-20' },
        ],
      },
    }, false)

    expect(timeline).toBeDefined()
    expect(timeline!.from).toBe('2024-03-02')
    expect(timeline!.to).toBe('2026-08-20')
    expect(timeline!.entries.map((entry) => [entry.kind, entry.date])).toEqual([
      ['lvef', '2024-03-02'],
      ['diagnosis', '2024-03-10'],
      ['medication', '2024-04-01'],
      ['lvef', '2025-06-11'],
      ['lvef', '2026-07-14'],
    ])

    const trajectory = timeline!.entries.filter((entry) => entry.kind === 'lvef')
    expect(trajectory.map((entry) => entry.value)).toEqual([38, 45, 52])
    expect(trajectory[0].detail).toBe('38%')

    // The code's own display text travels with the point.
    const diagnosis = timeline!.entries.find((entry) => entry.kind === 'diagnosis')
    expect(diagnosis!.detail).toBe('I50.22 慢性收縮性心臟衰竭')

    // A class with two dated prescriptions is a span, and the adapter's
    // 「目前用藥中」 is the only thing that says it is still being taken.
    const medication = timeline!.entries.find((entry) => entry.kind === 'medication')
    expect(medication).toMatchObject({
      date: '2024-04-01',
      endDate: '2026-08-20',
      label: 'SGLT2i',
      ongoing: true,
    })
  })

  it('reads a class the patient stopped as a span that is not ongoing', () => {
    const timeline = buildCareTimeline({
      LVEFTrend: lvefTrend([['2025-01-02', 30], ['2026-01-02', 41]]),
      mraTherapy: {
        zh: '目前未使用（最近一筆處方 2025-11-30 結束）',
        en: 'Not currently taking (latest prescription ended 2025-11-30)',
        sources: [
          { resourceType: 'MedicationRequest', resourceId: 'rx-3', date: '2025-02-10' },
          { resourceType: 'MedicationRequest', resourceId: 'rx-4', date: '2025-10-30' },
        ],
      },
    }, false)

    const medication = timeline!.entries.find((entry) => entry.kind === 'medication')
    expect(medication).toMatchObject({ date: '2025-02-10', endDate: '2025-10-30', ongoing: false })
  })

  it('keeps a single dated prescription as a point rather than inventing a period', () => {
    const timeline = buildCareTimeline({
      LVEFTrend: lvefTrend([['2025-01-02', 30], ['2026-01-02', 41]]),
      hfEvidenceBetaBlockerTherapy: {
        zh: '目前用藥中：Bisoprolol 2.5mg',
        en: 'Currently taking: Bisoprolol 2.5mg',
        sources: [{ resourceType: 'MedicationRequest', resourceId: 'rx-5', date: '2025-05-05' }],
      },
    }, false)

    const medication = timeline!.entries.find((entry) => entry.kind === 'medication')
    expect(medication!.date).toBe('2025-05-05')
    expect(medication!.endDate).toBeUndefined()
  })

  it('prefers the class the patient is taking when the guideline names two', () => {
    const timeline = buildCareTimeline({
      LVEFTrend: lvefTrend([['2025-01-02', 30], ['2026-01-02', 41]]),
      arniTherapy: {
        zh: '目前未使用',
        en: 'Not currently taking',
        sources: [{ resourceType: 'MedicationRequest', resourceId: 'rx-6', date: '2025-03-03' }],
      },
      aceArbTherapy: {
        zh: '目前用藥中：Valsartan 80mg',
        en: 'Currently taking: Valsartan 80mg',
        sources: [{ resourceType: 'MedicationRequest', resourceId: 'rx-7', date: '2025-04-04' }],
      },
    }, false)

    const medication = timeline!.entries.find((entry) => entry.kind === 'medication')
    expect(medication).toMatchObject({ date: '2025-04-04', ongoing: true })
    expect(medication!.detail).toBe('目前用藥中：Valsartan 80mg')
  })

  it('ignores undated sources and readings without a number', () => {
    const timeline = buildCareTimeline({
      LVEFTrend: {
        zh: 'trend',
        en: 'trend',
        sources: [
          { resourceType: 'Observation', resourceId: 'a', date: '2025-01-02', value: 30 },
          { resourceType: 'Observation', resourceId: 'b', value: 44 },
          { resourceType: 'Observation', resourceId: 'c', date: '2026-01-02', value: 'no number' },
          { resourceType: 'Observation', resourceId: 'd', date: '2026-02-02', value: 41 },
        ],
      },
    }, false)

    expect(timeline!.entries.map((entry) => entry.date)).toEqual(['2025-01-02', '2026-02-02'])
  })

  it('labels in English when asked', () => {
    const timeline = buildCareTimeline({
      LVEFTrend: lvefTrend([['2025-01-02', 30], ['2026-01-02', 41]]),
      heartFailureDiagnosis: {
        zh: '心衰竭',
        en: 'Heart failure',
        sources: [{ resourceType: 'Condition', resourceId: 'c1', date: '2025-01-05' }],
      },
    }, true)

    expect(timeline!.entries.find((entry) => entry.kind === 'diagnosis')!.label).toBe('HF diagnosis')
  })
})
