import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'

function observation(
  text: string,
  loinc: string | null,
  value: number,
  unit: string,
  date: string,
) {
  return {
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    specimen: { display: 'Serum' },
    code: {
      text,
      coding: loinc
        ? [{ system: 'http://loinc.org', code: loinc }]
        : [],
    },
    valueQuantity: {
      value,
      unit,
      system: 'http://unitsofmeasure.org',
      code: unit,
    },
  }
}

describe('cumulative report total protein and intact PTH normalization', () => {
  it('uses LOINC 2885-2 to place total protein in the liver subgroup as TP', () => {
    const pivots = buildLabPivots([
      observation('Protein,total 總蛋白', '2885-2', 7.6, 'g/dL', '2026-08-05'),
    ])
    const populated = pivots.chem.rows.filter((row) => row.values.size)

    expect(populated).toHaveLength(1)
    expect(populated[0]).toMatchObject({
      testKey: 'TP',
      displayName: 'TP',
      subgroupId: 'liver',
      unit: 'g/dL',
    })
    expect(populated[0].values.get('2026-08-05')).toMatchObject({ value: '7.6', unit: 'g/dL' })
    expect(pivots.other.rows.every((row) => row.values.size === 0)).toBe(true)
  })

  it.each([
    ['2731-8', 'pg/mL'],
    ['14866-8', 'pmol/L'],
  ])('uses intact PTH LOINC %s to place the result in the parathyroid subgroup', (loinc, unit) => {
    const pivots = buildLabPivots([
      observation('PTH-i 副甲狀腺素', loinc, 280.4, unit, '2026-06-03'),
    ])
    const populated = pivots.endocrine.rows.filter((row) => row.values.size)

    expect(populated).toHaveLength(1)
    expect(populated[0]).toMatchObject({
      testKey: 'IPTH',
      displayName: 'iPTH',
      subgroupId: 'parathy',
      unit,
    })
    expect(populated[0].values.get('2026-06-03')).toMatchObject({ value: '280.4', unit })
    expect(pivots.other.rows.every((row) => row.values.size === 0)).toBe(true)
  })

  it.each([
    ['Protein,total 總蛋白', 'TP', 'TP', 'chem', 'liver', 'g/dL'],
    ['PTH-i 副甲狀腺素', 'IPTH', 'iPTH', 'endocrine', 'parathy', 'pg/mL'],
  ])('normalizes name-only %s when a foreign Bundle has no LOINC', (text, testKey, displayName, categoryId, subgroupId, unit) => {
    const pivots = buildLabPivots([
      observation(text, null, 1, unit, '2026-01-01'),
    ])
    const populated = pivots[categoryId].rows.filter((row) => row.values.size)

    expect(populated).toHaveLength(1)
    expect(populated[0]).toMatchObject({ testKey, displayName, subgroupId })
  })

  it('does not merge intact PTH with a generic PTH result', () => {
    const pivots = buildLabPivots([
      observation('PTH-i 副甲狀腺素', '2731-8', 280.4, 'pg/mL', '2026-06-03'),
      observation('副甲狀腺素', null, 120, 'pg/mL', '2026-06-03'),
    ])
    const populated = pivots.endocrine.rows.filter((row) => row.values.size)

    expect(populated.map((row) => row.testKey)).toEqual(['IPTH', 'PTH'])
    expect(populated.map((row) => row.displayName)).toEqual(['iPTH', 'PTH'])
  })
})
