// Regression lock for the trend dialog's history table abnormal
// highlighting. Bridge-imported observations frequently lack the FHIR
// `interpretation` code, so before this fallback every row rendered
// uncoloured even when BUN was clearly outside its 8-20 mg/dL range.
//
// The derivation rules below MUST stay strict in two directions:
//   - Never invent a status when there's no usable range
//   - Never miss flagging a value that's genuinely outside the range
import { deriveStatusFromRange } from '@/features/clinical-summary/reports/components/ObservationHistoryTable'

describe('deriveStatusFromRange — referenceRange fallback', () => {
  it('flags a value above high as "high"', () => {
    expect(deriveStatusFromRange(24.4, { low: 8, high: 20 })).toBe('high')
  })

  it('flags a value below low as "low"', () => {
    expect(deriveStatusFromRange(5, { low: 8, high: 20 })).toBe('low')
  })

  it('returns "normal" when value is within range', () => {
    expect(deriveStatusFromRange(14, { low: 8, high: 20 })).toBe('normal')
  })

  it('returns "normal" on the inclusive boundary low', () => {
    // BUN 8 mg/dL with range [8, 20] should be normal, not low.
    expect(deriveStatusFromRange(8, { low: 8, high: 20 })).toBe('normal')
  })

  it('returns "normal" on the inclusive boundary high', () => {
    expect(deriveStatusFromRange(20, { low: 8, high: 20 })).toBe('normal')
  })

  it('handles upper-only bounds (e.g. CRP <5 mg/L)', () => {
    expect(deriveStatusFromRange(3, { high: 5 })).toBe('normal')
    expect(deriveStatusFromRange(7, { high: 5 })).toBe('high')
  })

  it('handles lower-only bounds (e.g. HDL >40)', () => {
    expect(deriveStatusFromRange(50, { low: 40 })).toBe('normal')
    expect(deriveStatusFromRange(30, { low: 40 })).toBe('low')
  })

  it('returns null when value is a string (qualitative result)', () => {
    expect(deriveStatusFromRange('Negative', { low: 0, high: 1 })).toBeNull()
  })

  it('returns null when value is undefined', () => {
    expect(deriveStatusFromRange(undefined, { low: 0, high: 1 })).toBeNull()
  })

  it('returns null when referenceRange is absent', () => {
    expect(deriveStatusFromRange(50)).toBeNull()
  })

  it('returns null when referenceRange has only text (no low/high) — caller falls through', () => {
    // referenceRange.text is deliberately NEVER parsed for abnormal detection
    // (2026-07-08 policy — too many unsafe formats; see interpretation-helpers.ts).
    // This helper only uses structured low/high.
    expect(deriveStatusFromRange(50, { text: '0-100' })).toBeNull()
  })
})
