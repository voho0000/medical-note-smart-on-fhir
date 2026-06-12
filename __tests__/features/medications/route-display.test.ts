// Locks for the SNOMED route-of-administration display map.
//
// TW-Core / IPS scenario bundles carry dosageInstruction.route as a bare
// SNOMED coding (no display/text), which previously rendered raw concept ids
// like "26643006" in the medication list. routeDisplayText resolves mapped
// concepts PER AUDIENCE — medical staff get the clinical sig abbreviation
// (PO / SC / IV…), patients get plain language (口服 / 皮下注射…) — mirroring
// the drug-name audience convention. All ids in SCT_ROUTE_LABELS were
// verified 2026-06-12 against tx.fhir.org $lookup and the HL7 R4
// route-codes value set.

import {
  routeDisplayText,
  routeAbbr,
  SCT_ROUTE_LABELS,
} from '@/features/clinical-summary/medications/utils/route-display'

const SCT = 'http://snomed.info/sct'
const oral = { coding: [{ system: SCT, code: '26643006' }] }
const subcut = { coding: [{ system: SCT, code: '34206005' }] }

describe('routeDisplayText — audience-aware labels', () => {
  it('medical audience gets the clinical abbreviation (PO / SC)', () => {
    expect(routeDisplayText(oral, { audience: 'medical' })).toBe('PO')
    expect(routeDisplayText(subcut, { audience: 'medical' })).toBe('SC')
  })

  it('patient audience gets plain Chinese under zh-TW', () => {
    expect(routeDisplayText(oral, { audience: 'patient', locale: 'zh-TW' })).toBe('口服')
    expect(routeDisplayText(subcut, { audience: 'patient', locale: 'zh-TW' })).toBe('皮下注射')
  })

  it('patient audience gets plain English under en locale', () => {
    expect(routeDisplayText(oral, { audience: 'patient', locale: 'en' })).toBe('Oral')
  })

  it('defaults to the medical abbreviation when no options are given', () => {
    expect(routeDisplayText({ coding: [{ system: SCT, code: '47625008' }] })).toBe('IV')
  })

  it('also maps when the coding has NO system (some scenario bundles omit it)', () => {
    expect(routeDisplayText({ coding: [{ code: '26643006' }] }, { audience: 'patient' })).toBe(
      '口服',
    )
  })

  it('source free text always wins', () => {
    const route = { text: '口服（飯後）', coding: [{ system: SCT, code: '26643006' }] }
    expect(routeDisplayText(route, { audience: 'medical' })).toBe('口服（飯後）')
  })

  it('a mapped concept outranks the coding display (canonical PO over "Oral route")', () => {
    const route = { coding: [{ system: SCT, code: '26643006', display: 'Oral route' }] }
    expect(routeDisplayText(route, { audience: 'medical' })).toBe('PO')
    expect(routeDisplayText(route, { audience: 'patient', locale: 'zh-TW' })).toBe('口服')
  })

  it('an UNMAPPED concept still uses its coding display', () => {
    const route = { coding: [{ system: SCT, code: '99999999', display: 'Some exotic route' }] }
    expect(routeDisplayText(route, { audience: 'medical' })).toBe('Some exotic route')
  })

  it('falls back to the raw code for an unmapped concept without display (no masking)', () => {
    expect(routeDisplayText({ coding: [{ system: SCT, code: '99999999' }] })).toBe('99999999')
  })

  it('does NOT map a numeric code from a different code system', () => {
    const route = { coding: [{ system: 'http://example.com/route', code: '26643006' }] }
    expect(routeDisplayText(route)).toBe('26643006')
  })

  it('returns the "—" sentinel for a missing/empty route', () => {
    expect(routeDisplayText(undefined)).toBe('—')
    expect(routeDisplayText({})).toBe('—')
  })

  it('every table entry has zh, en and abbr labels', () => {
    for (const [code, label] of Object.entries(SCT_ROUTE_LABELS)) {
      expect(label.zh.length).toBeGreaterThan(0)
      expect(label.en.length).toBeGreaterThan(0)
      expect(label.abbr).toMatch(/^[A-Z]{2,4}$/)
      expect(code).toMatch(/^\d+$/)
    }
  })
})

describe('routeAbbr — canonical English for the AI context', () => {
  it('returns the abbreviation for a mapped SNOMED route', () => {
    expect(routeAbbr(oral)).toBe('PO')
    expect(routeAbbr(subcut)).toBe('SC')
  })

  it('returns undefined for unmapped / missing routes', () => {
    expect(routeAbbr({ coding: [{ system: SCT, code: '99999999' }] })).toBeUndefined()
    expect(routeAbbr(undefined)).toBeUndefined()
  })
})
