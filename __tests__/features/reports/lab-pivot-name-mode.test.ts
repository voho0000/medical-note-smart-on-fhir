import { buildLabPivots } from '@/features/clinical-summary/reports/hooks/useLabPivot'

const lymphocyte = (id: string, text: string, sourceDisplay: string, date: string) => ({
  resourceType: 'Observation',
  id,
  code: {
    text,
    coding: [
      {
        system: 'http://loinc.org',
        code: '736-9',
        display: 'Lymphocytes/Leukocytes in Blood by Automated count',
      },
      {
        system: 'https://example.org/CodeSystem/his-local-lab',
        code: sourceDisplay,
        display: sourceDisplay,
      },
    ],
  },
  effectiveDateTime: date,
  valueQuantity: { value: 10, unit: '%' },
})

describe('buildLabPivots report name mode', () => {
  const observations = [
    lymphocyte('obs-lym', 'Lymphocytes', 'Lymphocytes %', '2026-07-14'),
    lymphocyte('obs-atypical', 'Lym', 'Atypical lym.', '2026-07-15'),
  ]

  it('keeps the current canonical LYM column in standardized mode', () => {
    const pivot = buildLabPivots(observations).cbc
    const populatedLymRows = pivot.rows.filter(
      (row) => row.testKey === 'LYM' && row.values.size > 0,
    )

    expect(populatedLymRows).toHaveLength(1)
    expect(populatedLymRows[0].displayName).toBe('LYM')
    expect([...populatedLymRows[0].values.keys()]).toEqual(
      expect.arrayContaining(['2026-07-14', '2026-07-15']),
    )
  })

  it('splits different source labels into separate columns in original mode', () => {
    const pivot = buildLabPivots(observations, { nameMode: 'original' }).cbc
    const populatedRows = pivot.rows.filter((row) => row.values.size > 0)

    expect(populatedRows.map((row) => row.displayName).sort()).toEqual([
      'Atypical lym.',
      'Lymphocytes %',
    ])
    expect(populatedRows.every((row) => row.testKey === 'LYM')).toBe(true)
  })
})
