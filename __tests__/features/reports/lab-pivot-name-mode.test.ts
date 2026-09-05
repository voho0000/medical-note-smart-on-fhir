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

const differential = (id: string, text: string, loinc: string, date: string) => ({
  resourceType: 'Observation',
  id,
  status: 'final',
  code: {
    text,
    coding: [
      { system: 'http://loinc.org', code: loinc },
      { system: 'urn:oid:nhi.lab.code', code: '08013C', display: '白血球分類計數' },
      { system: 'https://example.org/CodeSystem/his-local-lab', code: id, display: text },
    ],
  },
  specimen: { display: 'Blood' },
  effectiveDateTime: date,
  valueQuantity: { value: 2, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
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

  it('merges Band variants into one diff row ordered between NEU and LYM', () => {
    const pivot = buildLabPivots([
      differential('neu', 'Neutrophil', '770-8', '2026-07-18'),
      differential('band-loinc', 'Band form 嗜中性帶狀球', '764-1', '2026-07-18'),
      differential('band-short', 'Band', '764-1', '2026-07-17'),
      differential('band-cell', 'Band cell', '764-1', '2026-07-16'),
      differential('band-zh', '帶狀嗜中性白血球', '764-1', '2026-07-15'),
      differential('lym', 'Lymphocyte', '736-9', '2026-07-18'),
    ]).cbc
    const populatedRows = pivot.rows.filter((row) => row.values.size > 0)
    const bandRows = populatedRows.filter((row) => row.testKey === 'BAND')

    expect(bandRows).toHaveLength(1)
    expect(bandRows[0]).toMatchObject({ mapKey: 'BAND', displayName: 'BAND', subgroupId: 'diff' })
    expect([...bandRows[0].values.keys()]).toEqual([
      '2026-07-18', '2026-07-17', '2026-07-16', '2026-07-15',
    ])
    expect(bandRows[0].values.get('2026-07-18')).toMatchObject({ value: '2', unit: '%' })
    expect(populatedRows.map((row) => row.testKey)).toEqual(['NEU', 'BAND', 'LYM'])
  })

  it('keeps Band source variants separate in original-name mode', () => {
    const pivot = buildLabPivots([
      differential('band-loinc', 'Band form 嗜中性帶狀球', '764-1', '2026-07-18'),
      differential('band-short', 'Band', '764-1', '2026-07-17'),
      differential('band-cell', 'Band cell', '764-1', '2026-07-16'),
      differential('band-zh', '帶狀嗜中性白血球', '764-1', '2026-07-15'),
    ], { nameMode: 'original' }).cbc

    expect(pivot.rows.filter((row) => row.values.size > 0).map((row) => row.displayName).sort()).toEqual([
      'Band', 'Band cell', 'Band form 嗜中性帶狀球', '帶狀嗜中性白血球',
    ])
  })
})
