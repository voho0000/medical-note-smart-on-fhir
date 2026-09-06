import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'

// Synthetic observation using the coding/name/unit shape of NHI v1.7.1.
const magnesium = {
  resourceType: 'Observation',
  status: 'final',
  effectiveDateTime: '2026-01-01',
  code: {
    text: '鎂',
    coding: [
      { system: 'http://loinc.org', code: '2601-3', display: 'Magnesium [Moles/volume] in Serum or Plasma' },
      { system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code', code: '09046B', display: '鎂' },
    ],
  },
  valueQuantity: { value: 1.8, unit: 'mEq/L', code: 'meq/L', system: 'http://unitsofmeasure.org' },
}

describe('cumulative report magnesium panel', () => {
  it.each(['standardized', 'original'] as const)('places NHI magnesium in electrolytes in %s mode', (nameMode) => {
    const pivots = buildLabPivots([magnesium], { nameMode })
    const rows = pivots.chem.rows.filter((row) => row.values.size)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ testKey: 'MG', subgroupId: 'electrolyte' })
    expect(rows[0].values.get('2026-01-01')).toMatchObject({ value: '1.8', unit: 'mEq/L' })
    expect(pivots.other?.rows.filter((row) => row.values.size) ?? []).toHaveLength(0)
  })

  it.each(['鎂', 'Magnesium', 'Mg'])('places name-only %s in electrolytes', (text) => {
    const pivots = buildLabPivots([{ ...magnesium, code: { text } }])
    expect(pivots.chem.rows.find((row) => row.values.size)).toMatchObject({ testKey: 'MG', subgroupId: 'electrolyte' })
  })

  it('recognizes the molar LOINC without a display name', () => {
    const pivots = buildLabPivots([{ ...magnesium, code: { coding: [{ system: 'http://loinc.org', code: '2601-3' }] } }])
    expect(pivots.chem.rows.find((row) => row.values.size)).toMatchObject({ testKey: 'MG', subgroupId: 'electrolyte' })
  })

  it('keeps urine magnesium outside the blood chemistry panel', () => {
    const pivots = buildLabPivots([{ ...magnesium, specimen: { display: 'Urine' } }])
    expect(pivots.chem?.rows.some((row) => row.values.size) ?? false).toBe(false)
    expect(pivots.urine.rows.some((row) => row.values.size)).toBe(true)
  })
})
