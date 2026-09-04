import {
  labStatusSuffix,
  renderLabSeriesItems,
  type LabSeriesPoint,
} from '@/src/core/utils/lab-series-context.utils'

type ObservationSeed = {
  name: string
  value: number | string
  unit?: string
  date?: string
  interpretation?: string
  referenceRange?: Array<Record<string, unknown>>
  status?: string
  panel?: string
}

/** Build the point shape the lab category hands the renderer. */
function point(seed: ObservationSeed): LabSeriesPoint {
  const numeric = typeof seed.value === 'number'
  const observation: Record<string, unknown> = {
    code: { text: seed.name },
    effectiveDateTime: seed.date,
    status: seed.status,
    ...(numeric
      ? { valueQuantity: { value: seed.value, unit: seed.unit } }
      : { valueString: String(seed.value) }),
    ...(seed.interpretation
      ? { interpretation: [{ coding: [{ code: seed.interpretation }] }] }
      : {}),
    ...(seed.referenceRange ? { referenceRange: seed.referenceRange } : {}),
  }
  return {
    name: seed.name,
    unit: seed.unit ?? '',
    value: String(seed.value),
    date: seed.date,
    status: seed.status,
    panel: seed.panel ?? 'chem',
    observation,
  }
}

const lineFor = (items: string[], analyte: string) =>
  items.find((item) => item.startsWith(analyte)) ?? ''

describe('renderLabSeriesItems — numeric series', () => {
  const creatinine = [
    point({ name: 'Creatinine', value: 1.0, unit: 'mg/dL', date: '2025-03-04' }),
    point({ name: 'Creatinine', value: 1.9, unit: 'mg/dL', date: '2025-11-20', interpretation: 'H' }),
    point({ name: 'Creatinine', value: 1.4, unit: 'mg/dL', date: '2026-07-05' }),
    point({ name: 'Creatinine', value: 1.6, unit: 'mg/dL', date: '2026-08-02', interpretation: 'H' }),
    point({ name: 'Creatinine', value: 2.2, unit: 'mg/dL', date: '2026-08-30', interpretation: 'H' }),
  ]

  it('leads with the latest value, unit, date and abnormal flag', () => {
    const line = lineFor(renderLabSeriesItems(creatinine, 3), 'Creatinine')
    expect(line.startsWith('Creatinine 2.2 mg/dL (2026-08-30, H)')).toBe(true)
  })

  it('lists up to labDepth-1 prior readings newest-first, with their own flags', () => {
    const line = lineFor(renderLabSeriesItems(creatinine, 3), 'Creatinine')
    expect(line).toContain('prior 1.6H (08-02), 1.4 (07-05)')
    expect(line).not.toContain('1.9')
  })

  it('keeps the year on priors from a different year than the latest reading', () => {
    const line = lineFor(renderLabSeriesItems(creatinine, 4), 'Creatinine')
    expect(line).toContain('1.9H (2025-11-20)')
  })

  it('summarises hidden history with min/max, their dates, the start and the count', () => {
    const line = lineFor(renderLabSeriesItems(creatinine, 3), 'Creatinine')
    expect(line).toContain('range 1–2.2 (2025-03-04, 08-30) since 2025-03-04, n=5')
  })

  it('omits the range tail when every reading is already shown', () => {
    const line = lineFor(renderLabSeriesItems(creatinine, Number.POSITIVE_INFINITY), 'Creatinine')
    expect(line).not.toContain('range ')
    expect(line).not.toContain('n=')
    expect(line).toContain('1 (2025-03-04)')
  })

  it('depth 1 shows the latest reading alone plus the summary', () => {
    const line = lineFor(renderLabSeriesItems(creatinine, 1), 'Creatinine')
    expect(line).not.toContain('prior')
    expect(line).toContain('n=5')
  })

  it('marks a value abnormal from an audited reference range with no interpretation code', () => {
    const items = renderLabSeriesItems(
      [point({
        name: 'Potassium',
        value: 6.4,
        unit: 'mmol/L',
        date: '2026-08-30',
        referenceRange: [{ low: { value: 3.5 }, high: { value: 5.1 } }],
      })],
      3,
    )
    expect(lineFor(items, 'Potassium')).toContain('(2026-08-30, *)')
  })

  it('re-states a unit that changed between readings', () => {
    const items = renderLabSeriesItems(
      [
        point({ name: 'CRP', value: 5, unit: 'mg/L', date: '2026-07-05' }),
        point({ name: 'CRP', value: 0.9, unit: 'mg/dL', date: '2026-08-30' }),
      ],
      3,
    )
    expect(lineFor(items, 'CRP')).toContain('prior 5 mg/L (07-05)')
  })
})

describe('renderLabSeriesItems — qualitative results', () => {
  const cultures = [
    point({ name: 'Blood culture', value: 'No growth', date: '2026-06-01', panel: 'microbio' }),
    point({ name: 'Blood culture', value: 'E. coli', date: '2026-07-01', panel: 'microbio' }),
    point({ name: 'Blood culture', value: 'No growth', date: '2026-08-01', panel: 'microbio' }),
  ]

  it('keeps one line per result rather than collapsing them into a series', () => {
    const items = renderLabSeriesItems(cultures, 8)
    const lines = items.filter((item) => item.startsWith('Blood culture'))
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('Blood culture: No growth (2026-08-01)')
    expect(lines[1]).toBe('Blood culture: E. coli (2026-07-01)')
  })

  it('never merges two distinct qualitative results', () => {
    const items = renderLabSeriesItems(cultures, 8).join('\n')
    expect(items).toContain('E. coli')
    expect(items.match(/No growth/g)).toHaveLength(2)
  })

  it('caps at the depth and reports how many results were hidden', () => {
    const items = renderLabSeriesItems(cultures, 1)
    const lines = items.filter((item) => item.startsWith('Blood culture'))
    expect(lines).toEqual([
      'Blood culture: No growth (2026-08-01)',
      'Blood culture: …(2 earlier result(s), n=3)',
    ])
  })
})

describe('renderLabSeriesItems — grouping and ordering', () => {
  const mixed = [
    point({ name: 'Sodium', value: 140, unit: 'mmol/L', date: '2026-08-30' }),
    point({ name: 'Creatinine', value: 2.2, unit: 'mg/dL', date: '2026-08-30', interpretation: 'H' }),
    point({ name: 'Hemoglobin', value: 8.6, unit: 'g/dL', date: '2026-08-30', interpretation: 'L', panel: 'cbc' }),
    point({ name: 'Odd analyte', value: 3, unit: 'x', date: '2026-08-30', panel: '' }),
  ]

  it('emits a panel tag before each panel and orders panels by the shared taxonomy', () => {
    const items = renderLabSeriesItems(mixed, 3)
    expect(items).toContain('[cbc]')
    expect(items).toContain('[chem]')
    expect(items).toContain('[unclassified]')
    expect(items.indexOf('[cbc]')).toBeLessThan(items.indexOf('[chem]'))
    expect(items.indexOf('[chem]')).toBeLessThan(items.indexOf('[unclassified]'))
  })

  it('puts analytes abnormal at their latest reading first within a panel', () => {
    const items = renderLabSeriesItems(mixed, 3)
    const chem = items.slice(items.indexOf('[chem]') + 1)
    expect(chem.findIndex((i) => i.startsWith('Creatinine')))
      .toBeLessThan(chem.findIndex((i) => i.startsWith('Sodium')))
  })

  it('returns nothing for no points', () => {
    expect(renderLabSeriesItems([], 8)).toEqual([])
  })
})

describe('labStatusSuffix', () => {
  it.each(['final', 'amended', 'corrected', 'unknown', undefined])(
    'stays silent for the unremarkable status %s',
    (status) => {
      expect(labStatusSuffix(status)).toBe('')
    },
  )

  it('marks an actionable non-final status', () => {
    expect(labStatusSuffix('preliminary')).toBe(' {status:preliminary}')
  })

  it('carries the status onto the rendered line', () => {
    const items = renderLabSeriesItems(
      [point({ name: 'Creatinine', value: 1.1, unit: 'mg/dL', date: '2026-08-30', status: 'preliminary' })],
      3,
    )
    expect(lineFor(items, 'Creatinine')).toContain('{status:preliminary}')
  })
})
