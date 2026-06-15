import { labReportsCategory } from '@/src/core/categories/lab-reports.category'

// Creatinine measured 3× (trending up), Hemoglobin + CRP once, plus a narrative
// microbiology report with no numeric result.
const observations = [
  { id: 'cr1', code: { text: 'Creatinine' }, valueQuantity: { value: 1.2, unit: 'mg/dL' }, effectiveDateTime: '2026-01-10' },
  { id: 'cr2', code: { text: 'Creatinine' }, valueQuantity: { value: 1.5, unit: 'mg/dL' }, effectiveDateTime: '2026-03-10' },
  { id: 'cr3', code: { text: 'Creatinine' }, valueQuantity: { value: 2.1, unit: 'mg/dL' }, effectiveDateTime: '2026-05-10', interpretation: { coding: [{ code: 'H' }] } },
  { id: 'hb1', code: { text: 'Hemoglobin' }, valueQuantity: { value: 13, unit: 'g/dL' }, effectiveDateTime: '2026-05-10' },
]

const data = [
  { resourceType: 'DiagnosticReport', code: { text: 'CMP' }, effectiveDateTime: '2026-01-10', result: [{ reference: 'Observation/cr1' }] },
  { resourceType: 'DiagnosticReport', code: { text: 'CMP' }, effectiveDateTime: '2026-03-10', result: [{ reference: 'Observation/cr2' }] },
  { resourceType: 'DiagnosticReport', code: { text: 'CMP' }, effectiveDateTime: '2026-05-10', result: [{ reference: 'Observation/cr3' }, { reference: 'Observation/hb1' }] },
  { resourceType: 'Observation', code: { text: 'CRP' }, valueQuantity: { value: 5, unit: 'mg/L' }, effectiveDateTime: '2026-05-12' },
  { resourceType: 'DiagnosticReport', code: { text: 'Blood Culture' }, conclusion: 'No growth', effectiveDateTime: '2026-05-11', result: [] },
] as any

const all = { observations }
const section = (version: 'latest' | 'all') =>
  labReportsCategory.getContextSection(data, { labReportVersion: version, labReportTimeRange: 'all' } as any, all)

const lineFor = (items: string[], analyte: string) => items.find((i) => i.startsWith(analyte)) || ''

describe('labReportsCategory — per-analyte trend', () => {
  it('count tracks the version: latest = distinct analytes, all = every reading', () => {
    const latest = labReportsCategory.getCount(data, { labReportTimeRange: 'all', labReportVersion: 'latest' } as any, all)
    expect(latest).toBe(3) // Creatinine, Hemoglobin, CRP (narrative report not counted)
    const allReadings = labReportsCategory.getCount(data, { labReportTimeRange: 'all', labReportVersion: 'all' } as any, all)
    expect(allReadings).toBe(5) // Creatinine ×3 + Hemoglobin + CRP
  })

  it('all → chronological trend (oldest → newest) with abnormal flag', () => {
    const s = section('all')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const cr = lineFor(items, 'Creatinine')
    expect(cr).toContain('1.2')
    expect(cr).toContain('2.1')
    expect(cr).toContain('→') // it's a series
    expect(cr).toContain('[H]') // the 2.1 reading is flagged high
    expect(cr.indexOf('1.2')).toBeLessThan(cr.indexOf('2.1')) // oldest first
    expect(cr).toContain('(mg/dL)') // unit in the header
  })

  it('latest → only the most recent value per analyte', () => {
    const s = section('latest')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    const cr = lineFor(items, 'Creatinine')
    expect(cr).toContain('2.1')
    expect(cr).not.toContain('1.2') // older readings dropped
    expect(cr).not.toContain('→')
  })

  it('includes standalone observations and narrative conclusions', () => {
    const s = section('all')
    const items = Array.isArray(s) ? [] : s?.items ?? []
    expect(items.some((i) => i.startsWith('CRP'))).toBe(true)
    expect(items.some((i) => i.includes('No growth'))).toBe(true)
  })
})
