import { buildLabPivots } from '@/features/clinical-summary/reports/hooks/useLabPivot'

const LOINC = 'http://loinc.org'
const UCUM = 'http://unitsofmeasure.org'

function rangeObservation(
  id: string,
  code: string,
  display: string,
  date: string,
  low: number,
  high: number,
) {
  return {
    id,
    status: 'final',
    code: { coding: [{ system: LOINC, code, display }] },
    specimen: { display: 'Urine' },
    effectiveDateTime: date,
    valueRange: {
      low: { value: low, unit: '/HPF', system: UCUM, code: '/[HPF]' },
      high: { value: high, unit: '/HPF', system: UCUM, code: '/[HPF]' },
    },
  }
}

describe('buildLabPivots — FHIR valueRange', () => {
  it('keeps urine microscopy ranges visible and non-trendable', () => {
    const observations = [
      rangeObservation('wbc-low', '5821-4', 'WBC/HPF', '2026-08-14', 0, 5),
      rangeObservation('wbc-high', '5821-4', 'WBC/HPF', '2026-07-02', 30, 49),
      rangeObservation('epith', '5787-7', 'EPITH', '2026-08-14', 0, 5),
      rangeObservation('rbc-range', '5808-1', 'RBC/HPF', '2026-07-02', 30, 49),
      {
        id: 'rbc-quantity',
        status: 'final',
        code: { coding: [{ system: LOINC, code: '5808-1', display: 'RBC/HPF' }] },
        specimen: { display: 'Urine' },
        effectiveDateTime: '2026-08-14',
        valueQuantity: { value: 2, unit: '/HPF', system: UCUM, code: '/[HPF]' },
      },
    ]

    const rows = buildLabPivots(observations).urine.rows
    const wbc = rows.find((row) => row.testKey === 'WBC/HPF')
    const epith = rows.find((row) => row.testKey === 'EPITH')
    const rbc = rows.find((row) => row.testKey === 'RBC/HPF')

    expect(wbc?.values.get('2026-08-14')).toMatchObject({ value: '0–5', unit: '/HPF' })
    expect(wbc?.values.get('2026-07-02')).toMatchObject({ value: '30–49', unit: '/HPF' })
    expect(epith?.values.get('2026-08-14')).toMatchObject({ value: '0–5', unit: '/HPF' })
    expect(rbc?.values.get('2026-07-02')).toMatchObject({ value: '30–49', unit: '/HPF' })
    expect(rbc?.values.get('2026-08-14')).toMatchObject({ value: '2', unit: '/HPF' })
    expect(wbc?.trendChartable).toBe(false)
    expect(epith?.trendChartable).toBe(false)
    expect(rbc?.trendChartable).toBe(false)
  })
})
