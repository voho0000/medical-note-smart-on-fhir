// Locks for the SNOMED route-of-administration display map.
//
// TW-Core / IPS scenario bundles carry dosageInstruction.route as a bare
// SNOMED coding (no display/text), which previously rendered raw concept ids
// like "26643006" in the medication list. routeDisplayText adds ONE rung to
// the fallback chain (text → display → verified SNOMED label → raw code).
// All ids in SCT_ROUTE_LABELS were verified 2026-06-12 against tx.fhir.org
// $lookup and the HL7 R4 route-codes value set.

import {
  routeDisplayText,
  SCT_ROUTE_LABELS,
} from '@/features/clinical-summary/medications/utils/route-display'

const SCT = 'http://snomed.info/sct'

describe('routeDisplayText', () => {
  it('maps a bare SNOMED oral-route coding to 口服 (zh) / Oral (en)', () => {
    const route = { coding: [{ system: SCT, code: '26643006' }] }
    expect(routeDisplayText(route, 'zh-TW')).toBe('口服')
    expect(routeDisplayText(route, 'en')).toBe('Oral')
  })

  it('maps the subcutaneous route (insulin pen case from the scenario file)', () => {
    const route = { coding: [{ system: SCT, code: '34206005' }] }
    expect(routeDisplayText(route, 'zh-TW')).toBe('皮下注射')
  })

  it('also maps when the coding has NO system (some scenario bundles omit it)', () => {
    const route = { coding: [{ code: '26643006' }] }
    expect(routeDisplayText(route, 'zh-TW')).toBe('口服')
  })

  it('prefers route.text over everything', () => {
    const route = { text: '口服（飯後）', coding: [{ system: SCT, code: '26643006' }] }
    expect(routeDisplayText(route, 'zh-TW')).toBe('口服（飯後）')
  })

  it('prefers an existing coding display over the map', () => {
    const route = { coding: [{ system: SCT, code: '26643006', display: 'Oral route' }] }
    expect(routeDisplayText(route, 'zh-TW')).toBe('Oral route')
  })

  it('falls back to the raw code for an unmapped SNOMED concept (no masking)', () => {
    const route = { coding: [{ system: SCT, code: '99999999' }] }
    expect(routeDisplayText(route, 'zh-TW')).toBe('99999999')
  })

  it('does NOT map a numeric code from a different code system', () => {
    const route = { coding: [{ system: 'http://example.com/route', code: '26643006' }] }
    expect(routeDisplayText(route, 'zh-TW')).toBe('26643006')
  })

  it('returns the "—" sentinel for a missing/empty route', () => {
    expect(routeDisplayText(undefined, 'zh-TW')).toBe('—')
    expect(routeDisplayText({}, 'zh-TW')).toBe('—')
  })

  it('defaults to zh-TW labels when no locale is given', () => {
    expect(routeDisplayText({ coding: [{ system: SCT, code: '47625008' }] })).toBe('靜脈注射')
  })

  it('every table entry has both zh and en labels', () => {
    for (const [code, label] of Object.entries(SCT_ROUTE_LABELS)) {
      expect(label.zh.length).toBeGreaterThan(0)
      expect(label.en.length).toBeGreaterThan(0)
      expect(code).toMatch(/^\d+$/)
    }
  })
})
