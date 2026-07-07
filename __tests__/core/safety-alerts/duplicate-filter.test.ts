// Deterministic backstop for the duplicate-medication rule: a "duplicate"
// alert survives only if its cited med sources resolve to ≥2 DISTINCT
// non-pharmacy prescribers. A clinic + the 藥局 that dispensed its 慢箋 is one
// prescription — the small model flags it intermittently despite the prompt,
// so this guard drops it (both live scans and the demo snapshot).

import {
  filterDuplicateFalsePositives,
  enforceSeverityFloor,
  isPharmacyOrg,
} from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'
import type { SafetyScanResult } from '@/src/core/entities/safety-alert.entity'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'

const cat = (over: Partial<SummarySourceCatalogEntry>): SummarySourceCatalogEntry =>
  ({ key: 'M1', resourceType: 'MedicationRequest', display: '藥', date: '2026-06-25', organization: 'A院', ...over } as SummarySourceCatalogEntry)

const dupAlert = (sources: string[]): any =>
  ({ id: 'sa-0', severity: 'medium', title: '重複用藥', detail: '', evidence: [], sources, category: 'duplicate' })

const result = (alerts: any[]): SafetyScanResult => ({ scannedCount: 10, alerts })

describe('filterDuplicateFalsePositives', () => {
  it('drops a clinic + pharmacy duplicate (one prescription, dispensed)', () => {
    const catalog = [
      cat({ key: 'M8', organization: '示範嘉恩醫院' }),
      cat({ key: 'M13', organization: '示範康健藥局' }), // pharmacy
    ]
    const out = filterDuplicateFalsePositives(result([dupAlert(['M8', 'M13'])]), catalog)
    expect(out.alerts).toHaveLength(0)
  })

  it('keeps a genuine TWO-CLINIC duplicate', () => {
    const catalog = [
      cat({ key: 'M8', organization: '示範嘉恩醫院' }),
      cat({ key: 'M30', organization: '示範長青醫院' }),
    ]
    const out = filterDuplicateFalsePositives(result([dupAlert(['M8', 'M30'])]), catalog)
    expect(out.alerts).toHaveLength(1)
  })

  it('drops a duplicate whose only non-pharmacy source is a single clinic', () => {
    const catalog = [
      cat({ key: 'M8', organization: '示範嘉恩醫院' }),
      cat({ key: 'M9', organization: '示範嘉恩醫院' }), // same clinic refill
      cat({ key: 'M13', organization: '示範康健藥局' }),
    ]
    const out = filterDuplicateFalsePositives(result([dupAlert(['M8', 'M9', 'M13'])]), catalog)
    expect(out.alerts).toHaveLength(0)
  })

  it('never touches non-duplicate alerts', () => {
    const catalog = [cat({ key: 'L7', resourceType: 'DiagnosticReport', organization: '示範長青醫院' })]
    const renal: any = { id: 'sa-0', severity: 'high', title: '腎功能', detail: '', evidence: [], sources: ['L7'], category: 'renal' }
    const out = filterDuplicateFalsePositives(result([renal]), catalog)
    expect(out.alerts).toHaveLength(1)
  })

  it('leaves a duplicate untouched when no med source resolves (can not verify)', () => {
    const out = filterDuplicateFalsePositives(result([dupAlert(['X1'])]), [cat({ key: 'M1' })])
    expect(out.alerts).toHaveLength(1)
  })

  it('no-ops without a catalog', () => {
    const r = result([dupAlert(['M8', 'M13'])])
    expect(filterDuplicateFalsePositives(r, undefined).alerts).toHaveLength(1)
  })

  it('isPharmacyOrg detects 藥局 / 藥房', () => {
    expect(isPharmacyOrg('示範康健藥局')).toBe(true)
    expect(isPharmacyOrg('向陽藥房')).toBe(true)
    expect(isPharmacyOrg('示範長青醫院')).toBe(false)
    expect(isPharmacyOrg(undefined)).toBe(false)
  })
})

describe('enforceSeverityFloor (high must pass the time-to-harm test)', () => {
  const alert = (severity: string, category: string): any =>
    ({ id: 'sa-0', severity, title: 't', detail: '', evidence: [], sources: [], category })
  const wrap = (alerts: any[]): SafetyScanResult => ({ scannedCount: 5, alerts })
  const sevOf = (r: SafetyScanResult, i = 0) => r.alerts[i].severity

  it('downgrades a "high" duplicate to medium (duplication is never an emergency)', () => {
    expect(sevOf(enforceSeverityFloor(wrap([alert('high', 'duplicate')])))).toBe('medium')
  })

  it('downgrades a "high" monitoring gap to medium', () => {
    expect(sevOf(enforceSeverityFloor(wrap([alert('high', 'monitoring')])))).toBe('medium')
  })

  it('leaves a genuine acute "high" untouched (critical-lab / bleeding / renal / allergy)', () => {
    for (const c of ['critical-lab', 'bleeding', 'renal', 'allergy']) {
      expect(sevOf(enforceSeverityFloor(wrap([alert('high', c)])))).toBe('high')
    }
  })

  it('never raises severity — medium/low are left as-is', () => {
    const r = enforceSeverityFloor(wrap([alert('medium', 'duplicate'), alert('low', 'monitoring')]))
    expect(sevOf(r, 0)).toBe('medium')
    expect(sevOf(r, 1)).toBe('low')
  })
})
