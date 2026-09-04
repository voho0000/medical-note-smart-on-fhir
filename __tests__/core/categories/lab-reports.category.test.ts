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

// Analyte lines are headed by the CANONICAL name (CREA / HB), the same label
// the cumulative report uses — 'Creatinine' and 'Hemoglobin' resolve to those
// through the alias table.
const lineFor = (items: string[], analyte: string) => items.find((i) => i.startsWith(analyte)) || ''

describe('labReportsCategory — per-analyte trend', () => {
  it('count tracks the depth: latest = distinct analytes, other = every reading', () => {
    const latest = labReportsCategory.getCount(data, { labReportTimeRange: 'all', labDepth: 'latest' } as any, all)
    expect(latest).toBe(3) // Creatinine, Hemoglobin, CRP (narrative report not counted)
    const allReadings = labReportsCategory.getCount(data, { labReportTimeRange: 'all', labDepth: 'all' } as any, all)
    expect(allReadings).toBe(5) // Creatinine ×3 + Hemoglobin + CRP
  })

  it('all → chronological trend (oldest → newest) with abnormal flag', () => {
    const s = section('all')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const cr = lineFor(items, 'CREA')
    expect(cr).toContain('1.2')
    expect(cr).toContain('2.1')
    expect(cr).toContain('→') // it's a series
    expect(cr).toContain('[H]') // the 2.1 reading is flagged high
    expect(cr.indexOf('1.2')).toBeLessThan(cr.indexOf('2.1')) // oldest first
    expect(cr).toContain('(mg/dL)') // unit in the header
    expect(cr).not.toMatch(/\[O\d+\]/)
  })

  it('latest → only the most recent value per analyte', () => {
    const s = section('latest')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    // 'latest' lists analytes one per line under the source's own display
    // name; the pivot/Key-trends output below uses the canonical one.
    const cr = lineFor(items, 'Creatinine')
    expect(cr).toContain('2.1')
    expect(cr).not.toContain('1.2') // older readings dropped
    expect(cr).not.toContain('→')
    expect(cr).not.toMatch(/\[O\d+\]/)
  })

  it("depth='all' renders every reading uncapped (no …earlier elision)", () => {
    // 'all' = 每項目全部、不設上限。Creatinine 有 3 筆,全數保留,無「…earlier」。
    const s = section('all')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const cr = lineFor(items, 'CREA')
    expect(cr).toContain('1.2')
    expect(cr).toContain('1.5')
    expect(cr).toContain('2.1')
    expect(cr).not.toContain('earlier')
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
    // CRP is a categorized analyte → lives in the chem pivot table (one
    // multi-line item: header + dated rows) rather than a per-analyte line.
    const chemTable = items.find((i) => i.startsWith('[chem]'))
    expect(chemTable).toBeTruthy()
    expect(chemTable).toContain('CRP')
    expect(chemTable).toContain('\n| 2026-05-12 |')
    expect(chemTable).not.toMatch(/\[O\d+\]/)
    expect(items.find((i) => i.includes('No growth'))).not.toMatch(/\[L\d+\]/)
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

describe('labReportsCategory — pivot rendering (full-history mode)', () => {
  // Properly-coded analytes (WBC/CREA hit the canonical alias maps) so they
  // land in pivot tables; WBC has abnormal cells so it also drives Key trends.
  const mixed = [
    { resourceType: 'Observation', code: { text: 'WBC' }, valueQuantity: { value: 15.2, unit: 'K/µL' }, effectiveDateTime: '2026-05-01', interpretation: [{ coding: [{ code: 'H' }] }] },
    { resourceType: 'Observation', code: { text: 'WBC' }, valueQuantity: { value: 11.1, unit: 'K/µL' }, effectiveDateTime: '2026-04-01', interpretation: [{ coding: [{ code: 'H' }] }] },
    { resourceType: 'Observation', code: { text: 'CREA' }, valueQuantity: { value: 1.1, unit: 'mg/dL' }, effectiveDateTime: '2026-05-01' },
  ] as any

  const items = (() => {
    const s = labReportsCategory.getContextSection(
      mixed,
      { labDepth: '8', labReportTimeRange: 'all' } as any,
      { observations: [] },
    )
    return Array.isArray(s) ? [] : s?.items ?? []
  })()

  it('renders date × test pivot tables per panel', () => {
    // Each panel table is ONE multi-line item: "[cbc]\n| Date | … |\n…"
    const cbcTable = items.find((i) => i.startsWith('[cbc]'))
    expect(cbcTable).toBeTruthy()
    expect(cbcTable).toContain('| Date |')
    expect(cbcTable).toContain('WBC')
    // newest-first data row with the abnormal flag
    expect(cbcTable).toContain('\n| 2026-05-01 |')
    expect(cbcTable).toContain('15.2 H')
  })

  it('appends key trends for analytes with abnormal values', () => {
    const keyTrendHeader = items.findIndex((i) => i.startsWith('Key trends'))
    expect(keyTrendHeader).toBeGreaterThan(-1)
    const wbcTrend = items.slice(keyTrendHeader).find((i) => i.startsWith('WBC'))
    expect(wbcTrend).toBeTruthy()
    // oldest → newest with flags
    expect(wbcTrend!.indexOf('11.1')).toBeLessThan(wbcTrend!.indexOf('15.2'))
    expect(wbcTrend).toContain('[H]')
  })

  it('normal-only analytes stay out of key trends', () => {
    const keyTrendHeader = items.findIndex((i) => i.startsWith('Key trends'))
    const tail = items.slice(keyTrendHeader)
    expect(tail.some((i) => i.startsWith('CREA'))).toBe(false)
  })
})

describe('labReportsCategory — window fallback (empty range)', () => {
  // All readings are from 2026; a '1w' window relative to test-run "now" will
  // usually be empty, forcing the recent-sampling-day fallback.
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
    expect(items.some((i) => i.includes('no labs fell within the selected time range'))).toBe(true)
    // The readings themselves come back — as a 生化 pivot, since they now
    // categorise instead of falling through as loose lines.
    expect(items.join('\n')).toContain('CREA')
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

  // A recognised analyte renders as its panel's pivot (one row per sampling
  // day), so depth is counted in ROWS. It used to be counted in arrows, back
  // when 'Creatinine' failed categorisation and fell through as a loose
  // per-analyte line — the cap is the same, the shape it caps is not.
  const rows = (depth: string) => {
    const s = labReportsCategory.getContextSection(
      series,
      { labDepth: depth, labReportTimeRange: 'all' } as any,
      { observations: [] },
    )
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const chem = items.find((i) => i.startsWith('[chem]')) || ''
    return chem.split('\n').filter((line) => /^\| 20/.test(line)).length
  }

  it('caps the rendered trend at the configured point count', () => {
    // 3 per test → fewer readings than 16; 'all' shows the full 12-point series.
    expect(rows('3')).toBe(3)
    expect(rows('3')).toBeLessThan(rows('16'))
    expect(rows('16')).toBeLessThanOrEqual(rows('all'))
    expect(rows('all')).toBe(12) // every reading, uncapped
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
