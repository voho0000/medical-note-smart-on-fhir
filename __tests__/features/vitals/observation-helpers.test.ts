// Vital sign matching — the LOINC → alias → keyword fallback ladder.
//
// The interesting cases live at the boundaries between strategies. A
// vendor that ships LOINC should never trigger the alias path; a vendor
// that ships custom codes but no LOINC should match by alias; a vendor
// that ships only a `display` string should still match by keyword.
import {
  matchesVital,
  pickLatestByVital,
} from '@/features/clinical-summary/vitals/utils/observation-helpers'
import { VITAL } from '@/features/clinical-summary/vitals/types'

describe('vital descriptor matching', () => {
  test('LOINC path: standards-compliant observation matches', () => {
    const obs = {
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
    }
    expect(matchesVital(obs, VITAL.HR)).toBe(true)
  })

  test('alias path: vendor-custom code system matches without LOINC', () => {
    const obs = {
      code: {
        coding: [{
          system: 'https://bestshape.example/mqtt/metric-code',
          code: 'heart-rate',
          display: 'Heart rate',
        }],
      },
    }
    expect(matchesVital(obs, VITAL.HR)).toBe(true)
  })

  test('keyword path: code.text only, no recognised codes', () => {
    const obs = { code: { text: '心率 / Heart rate' } }
    expect(matchesVital(obs, VITAL.HR)).toBe(true)
  })

  test('rejects when none of the three strategies match', () => {
    const obs = {
      code: { coding: [{ system: 'http://loinc.org', code: '8302-2', display: 'Body height' }] },
    }
    expect(matchesVital(obs, VITAL.HR)).toBe(false)
  })

  test('no false positive between HR and RR (keywords are disjoint)', () => {
    const hr = { code: { text: 'heart rate' } }
    const rr = { code: { text: 'respiratory rate' } }
    expect(matchesVital(hr, VITAL.RR)).toBe(false)
    expect(matchesVital(rr, VITAL.HR)).toBe(false)
  })

  test('case-insensitive: HEART-RATE alias still matches', () => {
    const obs = { code: { coding: [{ code: 'HEART-RATE' }] } }
    expect(matchesVital(obs, VITAL.HR)).toBe(true)
  })

  test('pickLatestByVital returns the newest matching observation', () => {
    const older = {
      code: { coding: [{ code: 'heart-rate' }] },
      effectiveDateTime: '2026-06-01T10:00:00Z',
      valueQuantity: { value: 72 },
    }
    const newer = {
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      effectiveDateTime: '2026-06-10T10:00:00Z',
      valueQuantity: { value: 78 },
    }
    const picked = pickLatestByVital([older, newer] as any, VITAL.HR)
    expect(picked?.valueQuantity?.value).toBe(78)
  })

  test('Sgsc OCTOFLOW shape — bestshape.example custom system', () => {
    // Direct copy from the live server (only fields relevant to matching).
    const obs = {
      code: {
        coding: [{
          system: 'https://bestshape.example/mqtt/metric-code',
          code: 'heart-rate',
          display: 'Heart rate',
        }],
      },
      effectiveDateTime: '2026-06-09T10:00:00Z',
      valueQuantity: { value: 84 },
    }
    expect(matchesVital(obs, VITAL.HR)).toBe(true)
    expect(pickLatestByVital([obs] as any, VITAL.HR)?.valueQuantity?.value).toBe(84)
  })

  test('LOINC blood-pressure panel components match via descriptor', () => {
    const sys = {
      code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic' }] },
    }
    const dia = {
      code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic' }] },
    }
    expect(matchesVital(sys, VITAL.BP_SYS)).toBe(true)
    expect(matchesVital(dia, VITAL.BP_DIA)).toBe(true)
    expect(matchesVital(sys, VITAL.BP_DIA)).toBe(false)
  })
})
