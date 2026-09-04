import { labReportsCategory } from '@/src/core/categories/lab-reports.category'
import { observationsCategory } from '@/src/core/categories/observations.category'

// Creatinine measured 3× (trending up), Hemoglobin + CRP once, plus a narrative
// microbiology report with no numeric result.
const observations = [
  { id: 'cr1', code: { text: 'Creatinine' }, valueQuantity: { value: 1.2, unit: 'mg/dL' }, effectiveDateTime: '2026-01-10' },
  { id: 'cr2', code: { text: 'Creatinine' }, valueQuantity: { value: 1.5, unit: 'mg/dL' }, effectiveDateTime: '2026-03-10' },
  { id: 'cr3', code: { text: 'Creatinine' }, valueQuantity: { value: 2.1, unit: 'mg/dL' }, effectiveDateTime: '2026-05-10', interpretation: { coding: [{ code: 'H' }] } },
  { id: 'hb1', code: { text: 'Hemoglobin' }, valueQuantity: { value: 13, unit: 'g/dL' }, effectiveDateTime: '2026-05-10' },
]

const data = [
  { id: 'cmp-jan', resourceType: 'DiagnosticReport', code: { text: 'CMP' }, effectiveDateTime: '2026-01-10', result: [{ reference: 'Observation/cr1' }] },
  { id: 'cmp-mar', resourceType: 'DiagnosticReport', code: { text: 'CMP' }, effectiveDateTime: '2026-03-10', result: [{ reference: 'Observation/cr2' }] },
  { id: 'cmp-may', resourceType: 'DiagnosticReport', code: { text: 'CMP' }, effectiveDateTime: '2026-05-10', result: [{ reference: 'Observation/cr3' }, { reference: 'Observation/hb1' }] },
  { id: 'crp1', resourceType: 'Observation', code: { text: 'CRP' }, valueQuantity: { value: 5, unit: 'mg/L' }, effectiveDateTime: '2026-05-12' },
  { id: 'culture1', resourceType: 'DiagnosticReport', code: { text: 'Blood Culture' }, conclusion: 'No growth', effectiveDateTime: '2026-05-11', result: [] },
] as any

const all = {
  observations: [...observations, data[3]],
  diagnosticReports: data.filter((item: any) => item.resourceType === 'DiagnosticReport'),
}
const section = (depth: 'latest' | '3' | '8' | '16' | 'all') =>
  labReportsCategory.getContextSection(data, { labDepth: depth, labReportTimeRange: 'all' } as any, all)

// Analyte lines are headed by the SOURCE's own label ('Creatinine', not the
// canonical 'CREA'), because summary citations resolve a context line against
// the source catalog by resource type + date + `code.text`.
const lineFor = (items: string[], analyte: string) => items.find((i) => i.startsWith(analyte)) || ''

describe('labReportsCategory — per-analyte series', () => {
  it('count tracks the depth: latest = distinct analytes, other = every reading', () => {
    const latest = labReportsCategory.getCount(data, { labReportTimeRange: 'all', labDepth: 'latest' } as any, all)
    expect(latest).toBe(3) // Creatinine, Hemoglobin, CRP (narrative report not counted)
    const allReadings = labReportsCategory.getCount(data, { labReportTimeRange: 'all', labDepth: 'all' } as any, all)
    expect(allReadings).toBe(5) // Creatinine ×3 + Hemoglobin + CRP
  })

  it('all → latest value first, then priors newest-first, with the abnormal flag', () => {
    const s = section('all')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const cr = lineFor(items, 'Creatinine')
    expect(cr).toContain('2.1')
    expect(cr).toContain('1.5')
    expect(cr).toContain('1.2')
    expect(cr).toContain('prior')
    expect(cr).toContain('mg/dL') // unit next to the latest value
    // Latest (abnormal, flagged H) leads; the oldest reading trails.
    expect(cr.indexOf('2.1')).toBeLessThan(cr.indexOf('1.2'))
    expect(cr).toMatch(/2\.1 mg\/dL \(2026-05-10, H\)/)
    expect(cr).not.toMatch(/\[O\d+\]/)
  })

  it('latest → only the most recent value per analyte', () => {
    const s = section('latest')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const cr = lineFor(items, 'Creatinine')
    expect(cr).toContain('2.1')
    // Older readings are summarised by the range tail, never listed one by one.
    expect(cr).not.toContain('prior')
    expect(cr).not.toContain('1.5')
    expect(cr).not.toMatch(/\[O\d+\]/)
  })

  it('summarises hidden history losslessly (min/max with dates + total count)', () => {
    const s = section('latest')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const cr = lineFor(items, 'Creatinine')
    // 3 readings, 1 shown → the other 2 are still accounted for.
    expect(cr).toContain('range 1.2–2.1')
    expect(cr).toContain('(01-10, 05-10)')
    expect(cr).toContain('since 2026-01-10')
    expect(cr).toContain('n=3')
  })

  it("depth='all' renders every reading with no range tail (nothing was hidden)", () => {
    const s = section('all')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const cr = lineFor(items, 'Creatinine')
    expect(cr).toContain('1.2')
    expect(cr).toContain('1.5')
    expect(cr).toContain('2.1')
    expect(cr).not.toContain('n=')
    expect(cr).not.toContain('range')
  })

  it("tolerates a missing labDepth (defaults to the latest branch, no crash)", () => {
    expect(() =>
      labReportsCategory.getCount(data, { labReportTimeRange: 'all' } as any, all),
    ).not.toThrow()
    const s = labReportsCategory.getContextSection(data, { labReportTimeRange: 'all' } as any, all)
    expect(s).toBeTruthy()
  })

  it('includes standalone observations and narrative conclusions', () => {
    const s = section('all')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const crp = lineFor(items, 'CRP')
    expect(crp).toContain('5')
    expect(crp).toContain('mg/L')
    expect(crp).not.toMatch(/\[O\d+\]/)
    expect(items.find((i) => i.includes('No growth'))).not.toMatch(/\[L\d+\]/)
  })

  it('groups analytes under their lab panel', () => {
    const s = section('all')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    expect(items).toContain('[chem]')
    expect(items).toContain('[cbc]')
    // The panel tag precedes the analytes that belong to it.
    expect(items.indexOf('[cbc]')).toBeLessThan(items.indexOf(lineFor(items, 'Hemoglobin')))
  })

  it('keeps non-lab standalone observations out of Lab Reports and in Other Observations', () => {
    const clinicalData = {
      diagnosticReports: [],
      observations: [
        { id: 'other-1', code: { text: 'Free-text finding' }, valueString: 'present', effectiveDateTime: '2026-05-12' },
        { id: 'vital-1', code: { text: 'Heart rate' }, valueQuantity: { value: 70, unit: '/min' }, effectiveDateTime: '2026-05-12' },
      ],
      vitalSigns: [
        { id: 'vital-1', code: { text: 'Heart rate' }, valueQuantity: { value: 70, unit: '/min' }, effectiveDateTime: '2026-05-12' },
      ],
    } as any
    const labs = labReportsCategory.extractData(clinicalData) as any[]
    const others = observationsCategory.extractData(clinicalData) as any[]

    expect(labs.map((item) => item.id)).toEqual([])
    expect(others.map((item) => item.id)).toEqual(['other-1'])
  })
})

describe('labReportsCategory — source finality status', () => {
  const render = (status: string, depth: 'latest' | '8') => {
    const statusData = [{
      resourceType: 'Observation',
      status,
      code: { text: 'Creatinine' },
      valueQuantity: { value: 0.8, unit: 'mg/dL' },
      effectiveDateTime: '2026-06-08',
    }] as any
    const section = labReportsCategory.getContextSection(
      statusData,
      { labDepth: depth, labReportTimeRange: 'all' } as any,
      { observations: [] },
    )
    return (Array.isArray(section) ? [] : section?.items ?? []).join('\n')
  }

  it.each(['latest', '8'] as const)(
    'suppresses repeated unknown markers and emits one section-level note in %s mode',
    (depth) => {
      const output = render('unknown', depth)

      expect(output).toContain('0.8')
      expect(output).not.toContain('{status:unknown}')
      expect(output.match(/laboratory report finality status is unavailable/g)).toHaveLength(1)
    },
  )

  it('continues to flag actionable non-final statuses per result', () => {
    const output = render('preliminary', '8')

    expect(output).toContain('{status:preliminary}')
    expect(output).not.toContain('finality status is unavailable')
  })
})

describe('labReportsCategory — abnormal ordering and flags', () => {
  // Properly-coded analytes so both land in the cbc/chem panels; WBC is
  // abnormal at its latest reading, CREA is not.
  const mixed = [
    { resourceType: 'Observation', code: { text: 'WBC' }, valueQuantity: { value: 15.2, unit: 'K/µL' }, effectiveDateTime: '2026-05-01', interpretation: [{ coding: [{ code: 'H' }] }] },
    { resourceType: 'Observation', code: { text: 'WBC' }, valueQuantity: { value: 11.1, unit: 'K/µL' }, effectiveDateTime: '2026-04-01', interpretation: [{ coding: [{ code: 'H' }] }] },
    { resourceType: 'Observation', code: { text: 'CREA' }, valueQuantity: { value: 1.1, unit: 'mg/dL' }, effectiveDateTime: '2026-05-01' },
    { resourceType: 'Observation', code: { text: 'ALT' }, valueQuantity: { value: 90, unit: 'U/L' }, effectiveDateTime: '2026-05-01', interpretation: [{ coding: [{ code: 'H' }] }] },
  ] as any

  const items = (() => {
    const s = labReportsCategory.getContextSection(
      mixed,
      { labDepth: '8', labReportTimeRange: 'all' } as any,
      { observations: [] },
    )
    return Array.isArray(s) ? [] : s?.items ?? []
  })()

  it('flags the latest reading and every prior reading independently', () => {
    const wbc = items.find((i) => i.startsWith('WBC')) || ''
    expect(wbc).toContain('WBC 15.2 K/µL (2026-05-01, H)')
    expect(wbc).toContain('prior 11.1H (04-01)')
  })

  it('normal analytes carry no flag', () => {
    const crea = items.find((i) => i.startsWith('CREA')) || ''
    expect(crea).toContain('CREA 1.1 mg/dL (2026-05-01)')
    expect(crea).not.toMatch(/\(2026-05-01, /)
  })

  it('within a panel, analytes abnormal at their latest reading come first', () => {
    const chem = items.indexOf('[chem]')
    const panel = items.slice(chem + 1)
    expect(panel.findIndex((i) => i.startsWith('ALT')))
      .toBeLessThan(panel.findIndex((i) => i.startsWith('CREA')))
  })
})

describe('labReportsCategory — window fallback (empty range)', () => {
  // All readings are from 2020; a '1w' window relative to test-run "now" will
  // always be empty, forcing the recent-sampling-day fallback.
  const oldData = [
    { resourceType: 'Observation', code: { text: 'Creatinine' }, valueQuantity: { value: 1.2, unit: 'mg/dL' }, effectiveDateTime: '2020-01-10' },
    { resourceType: 'Observation', code: { text: 'Creatinine' }, valueQuantity: { value: 1.5, unit: 'mg/dL' }, effectiveDateTime: '2020-02-10' },
  ] as any
  const allOld = { observations: [] }

  it('falls back to recent sampling days instead of an empty section', () => {
    const s = labReportsCategory.getContextSection(
      oldData,
      { labDepth: '8', labReportTimeRange: '1w' } as any,
      allOld,
    )
    const items = Array.isArray(s) ? [] : s?.items ?? []
    expect(items.some((i) => i.includes('predate the selected time range'))).toBe(true)
    expect(items.join('\n')).toContain('Creatinine')
  })

  it('getCount matches the fallback (non-zero) rather than reporting 0', () => {
    const count = labReportsCategory.getCount(
      oldData,
      { labDepth: '8', labReportTimeRange: '1w' } as any,
      allOld,
    )
    expect(count).toBeGreaterThan(0)
  })
})

describe('labReportsCategory — trend depth', () => {
  const series = Array.from({ length: 12 }, (_, i) => ({
    resourceType: 'Observation',
    code: { text: 'Creatinine' },
    valueQuantity: { value: 1 + i * 0.1, unit: 'mg/dL' },
    effectiveDateTime: `2026-${String(i + 1).padStart(2, '0')}-01`.replace('2026-13', '2026-12'),
  })) as any

  // Depth is counted in READINGS shown on the analyte's line: the latest value
  // plus its `prior` list.
  const shown = (depth: string) => {
    const s = labReportsCategory.getContextSection(
      series,
      { labDepth: depth, labReportTimeRange: 'all' } as any,
      { observations: [] },
    )
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const line = items.find((i) => i.startsWith('Creatinine')) || ''
    const priors = /\| prior ([^|]+)/.exec(line)
    return 1 + (priors ? priors[1].split(',').length : 0)
  }

  it('caps the rendered readings at the configured point count', () => {
    expect(shown('3')).toBe(3)
    expect(shown('3')).toBeLessThan(shown('16'))
    expect(shown('16')).toBeLessThanOrEqual(shown('all'))
    expect(shown('all')).toBe(12) // every reading, uncapped
  })

  it('a capped analyte still reports the full series size and extremes', () => {
    const s = labReportsCategory.getContextSection(
      series,
      { labDepth: '3', labReportTimeRange: 'all' } as any,
      { observations: [] },
    )
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const line = items.find((i) => i.startsWith('Creatinine')) || ''
    expect(line).toContain('n=12')
    expect(line).toContain('range 1–2.1')
  })
})

describe('labReportsCategory — panel sub-selection', () => {
  // WBC → cbc panel, Creatinine → chem panel (via canonical categorization).
  const mixed = [
    { resourceType: 'Observation', code: { text: 'WBC' }, valueQuantity: { value: 7, unit: '10^3/uL' }, effectiveDateTime: '2026-05-01' },
    { resourceType: 'Observation', code: { text: 'Creatinine' }, valueQuantity: { value: 1.1, unit: 'mg/dL' }, effectiveDateTime: '2026-05-01' },
  ] as any

  it('empty labPanelIds includes every panel', () => {
    const s = labReportsCategory.getContextSection(
      mixed,
      { labDepth: 'latest', labReportTimeRange: 'all', labPanelIds: '' } as any,
      { observations: [] },
    )
    const items = Array.isArray(s) ? [] : s?.items ?? []
    expect(items.some((i) => i.startsWith('WBC'))).toBe(true)
    expect(items.some((i) => i.startsWith('Creatinine'))).toBe(true)
  })

  it('restricting to cbc drops the chem analyte', () => {
    const s = labReportsCategory.getContextSection(
      mixed,
      { labDepth: 'latest', labReportTimeRange: 'all', labPanelIds: 'cbc' } as any,
      { observations: [] },
    )
    const items = Array.isArray(s) ? [] : s?.items ?? []
    expect(items.some((i) => i.startsWith('WBC'))).toBe(true)
    expect(items.some((i) => i.startsWith('Creatinine'))).toBe(false)
  })

  it('getCount reflects the panel filter', () => {
    const cbcOnly = labReportsCategory.getCount(
      mixed,
      { labDepth: 'latest', labReportTimeRange: 'all', labPanelIds: 'cbc' } as any,
      { observations: [] },
    )
    expect(cbcOnly).toBe(1)
  })
})

// Regression: widening the lab time range must never REMOVE analytes.
//
// Found on a real chart whose last full panel predated every offered window but
// which had one isolated later reading. The recent-sampling-days fallback used
// to fire only when the window was COMPLETELY empty, so:
//   6m  → window empty        → fallback → the whole last panel rendered
//   3y  → window caught the 1 stray reading → fallback suppressed → 1 analyte
// i.e. asking for MORE history hid the patient's most recent real panel. The
// fallback is now a floor that is unioned with the window, so the result is
// monotone in the range.
//
// SYNTHETIC data in the real shape: one dense old panel, one sparse later reading.
describe('labReportsCategory — recent sampling days are a floor, not an alternative', () => {
  const STALE_PANEL_DAY = '2019-04-02'
  const STRAY_DAY = '2024-06-15'

  const staleObservations = [
    { id: 's1', code: { text: 'Sodium' }, valueQuantity: { value: 140, unit: 'mmol/L' }, effectiveDateTime: STALE_PANEL_DAY },
    { id: 's2', code: { text: 'Potassium' }, valueQuantity: { value: 4.1, unit: 'mmol/L' }, effectiveDateTime: STALE_PANEL_DAY },
    { id: 's3', code: { text: 'Chloride' }, valueQuantity: { value: 103, unit: 'mmol/L' }, effectiveDateTime: STALE_PANEL_DAY },
    { id: 'stray', code: { text: 'Glucose' }, valueQuantity: { value: 95, unit: 'mg/dL' }, effectiveDateTime: STRAY_DAY },
  ]
  const staleData = [
    {
      id: 'panel-old',
      resourceType: 'DiagnosticReport',
      code: { text: 'Electrolytes' },
      effectiveDateTime: STALE_PANEL_DAY,
      result: [{ reference: 'Observation/s1' }, { reference: 'Observation/s2' }, { reference: 'Observation/s3' }],
    },
    {
      id: 'panel-stray',
      resourceType: 'DiagnosticReport',
      code: { text: 'Glucose' },
      effectiveDateTime: STRAY_DAY,
      result: [{ reference: 'Observation/stray' }],
    },
  ] as any
  const staleAll = { observations: staleObservations, diagnosticReports: staleData }

  const itemsFor = (range: string): string[] => {
    const section = labReportsCategory.getContextSection(
      staleData,
      { labDepth: '8', labReportTimeRange: range } as any,
      staleAll,
    )
    return Array.isArray(section) ? [] : section?.items ?? []
  }

  const analytes = (range: string): string[] =>
    itemsFor(range).filter((line) =>
      !line.startsWith('[') && !line.startsWith('Note:') && line.trim() !== '',
    )

  beforeAll(() => {
    jest.useFakeTimers()
    // Both sampling days are in the past: 6m catches nothing, 3y catches only
    // the stray reading, `all` catches everything.
    jest.setSystemTime(Date.parse('2026-07-13T12:00:00+08:00'))
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  it('keeps the last full panel visible when the window catches only a stray reading', () => {
    const wide = analytes('3y')
    for (const analyte of ['Sodium', 'Potassium', 'Chloride', 'Glucose']) {
      expect(wide.some((line) => line.startsWith(analyte))).toBe(true)
    }
  })

  it('never renders fewer analytes as the range widens', () => {
    const counts = ['6m', '1y', '3y', 'all'].map((range) => analytes(range).length)
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])
    }
  })

  it('flags that the shown sampling days predate the selected range', () => {
    const items = itemsFor('6m')
    expect(items.some((line) => line.startsWith('Note:') && line.includes('predate the selected time range'))).toBe(true)
  })

  it('does not claim a fallback when the window already holds the recent days', () => {
    const items = itemsFor('all')
    expect(items.some((line) => line.includes('predate the selected time range'))).toBe(false)
  })
})
