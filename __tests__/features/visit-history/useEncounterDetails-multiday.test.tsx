// Regression locks for the multi-day rollups in useEncounterDetails: an
// inpatient stay with daily CBC + insulin should produce isMultiDay=true,
// per-analyte test series, and per-drug med series — without collapsing
// the single-day outpatient case.
import { renderHook } from '@testing-library/react'
import { useEncounterDetails } from '@/features/clinical-summary/visit-history/hooks/useEncounterDetails'

const obs = (id: string, text: string, date: string, opts: any = {}) => ({
  id,
  encounter: { reference: 'Encounter/e1' },
  code: { text },
  valueQuantity: { value: opts.value ?? 1, unit: opts.unit ?? 'x' },
  effectiveDateTime: date,
  referenceRange: opts.referenceRange,
  interpretation: opts.interpretation,
})

const med = (id: string, name: string, authoredOn: string) => ({
  id,
  encounter: { reference: 'Encounter/e1' },
  medicationCodeableConcept: { text: name, coding: [{ display: name }] },
  authoredOn,
  status: 'active',
})

function run(observations: any[], medications: any[] = []) {
  const { result } = renderHook(() =>
    useEncounterDetails(medications, [], observations, [], [], [], 'en', 'medical'),
  )
  return result.current.get('e1')!
}

describe('useEncounterDetails — multi-day rollups', () => {
  it('isMultiDay = false for a single-day visit', () => {
    const d = run([
      obs('o1', 'WBC', '2025-05-18T08:00:00Z'),
      obs('o2', 'WBC', '2025-05-18T14:00:00Z'), // same day, different time
      obs('o3', 'HB', '2025-05-18T08:00:00Z'),
    ])
    expect(d.isMultiDay).toBe(false)
    expect(d.testGroups[0].testSeries).toEqual([])
    expect(d.medSeries).toEqual([])
  })

  it('isMultiDay = true when tests span 2+ calendar days', () => {
    const d = run([
      obs('o1', 'WBC', '2025-05-18T08:00:00Z'),
      obs('o2', 'WBC', '2025-05-19T08:00:00Z'),
    ])
    expect(d.isMultiDay).toBe(true)
  })

  it('rolls up same-analyte tests into one series sorted oldest-first', () => {
    const d = run([
      // Out-of-order on purpose; should re-sort.
      obs('o3', 'HB', '2025-05-20T08:00:00Z', { value: 12.7 }),
      obs('o1', 'HB', '2025-05-18T08:00:00Z', { value: 11.4 }),
      obs('o2', 'HB', '2025-05-19T08:00:00Z', { value: 12.7 }),
      obs('o4', 'HB', '2025-05-21T08:00:00Z', { value: 11.7 }),
    ])
    expect(d.isMultiDay).toBe(true)
    const cbc = d.testGroups.find((g) => g.categoryId === 'cbc')!
    expect(cbc.testSeries).toHaveLength(1)
    const series = cbc.testSeries[0]
    expect(series.values.map((v) => v.id)).toEqual(['o1', 'o2', 'o3', 'o4'])
  })

  it('counts abnormal values via refRangeAbnormal flag', () => {
    const d = run([
      // Two HB values below the [13.5–17.5] range.
      obs('o1', 'HB', '2025-05-18T08:00:00Z', {
        value: 11.4,
        referenceRange: [{ low: { value: 13.5, unit: 'g/dL' }, high: { value: 17.5, unit: 'g/dL' } }],
      }),
      obs('o2', 'HB', '2025-05-19T08:00:00Z', {
        value: 12.7,
        referenceRange: [{ low: { value: 13.5, unit: 'g/dL' }, high: { value: 17.5, unit: 'g/dL' } }],
      }),
    ])
    const cbc = d.testGroups.find((g) => g.categoryId === 'cbc')!
    expect(cbc.testSeries[0].abnormalCount).toBe(2)
  })

  it('groups medications by name across refills', () => {
    const d = run(
      [
        obs('o1', 'WBC', '2025-05-18T08:00:00Z'),
        obs('o2', 'WBC', '2025-05-19T08:00:00Z'),
      ],
      [
        med('m1', 'INSULIN ASPART', '2025-05-18T08:00:00Z'),
        med('m2', 'INSULIN ASPART', '2025-05-19T08:00:00Z'),
        med('m3', 'INSULIN ASPART', '2025-05-20T08:00:00Z'),
        med('m4', 'ASPIRIN', '2025-05-18T08:00:00Z'),
      ],
    )
    expect(d.medSeries.map((s) => s.name)).toEqual(['INSULIN ASPART', 'ASPIRIN'])
    expect(d.medSeries[0].refills).toHaveLength(3)
    expect(d.medSeries[1].refills).toHaveLength(1)
  })

  it('does not build medSeries for single-day visits', () => {
    const d = run(
      [obs('o1', 'WBC', '2025-05-18T08:00:00Z')],
      [med('m1', 'ASPIRIN', '2025-05-18T08:00:00Z')],
    )
    expect(d.medSeries).toEqual([])
  })
})
