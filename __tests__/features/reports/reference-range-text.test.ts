// Reference-range display: the bridge sometimes emits the whole text twice
// ("[X][X]"), and for age/sex-stratified analytes X is a very long band list
// that overflowed the screen. Policy: de-duplicate the doubled halves and never
// double-wrap brackets; the (still long) single copy is shown wrapped in the
// hover tooltip. This locks the de-dup / single-wrap behaviour.
import { getReferenceRangeText } from '@/features/clinical-summary/reports/utils/fhir-helpers'

const BAND = '[0-14d]36.0-60.0 [15-30d]30.5-45.0 [31-180d]26.8-37.5 [0.5-6y]30.8-37.9 [6-18y]32.2-43.5 [≧18y]Men:39.6-51.5, Women:34.8-46.3'

describe('getReferenceRangeText — doubled / long stratified text', () => {
  it('collapses a doubled simple range "[lo ~ hi][lo ~ hi]" to one copy', () => {
    expect(getReferenceRangeText([{ text: '[4180 ~ 9380][4180 ~ 9380]' }])).toBe('[4180 ~ 9380]')
  })

  it('collapses a doubled age/sex-stratified band list to a single copy', () => {
    const out = getReferenceRangeText([{ text: `[${BAND}][${BAND}]` }])
    // exactly one occurrence of the last band — not duplicated
    expect(out.split('Women:34.8-46.3').length - 1).toBe(1)
    // single outer bracket layer, not "[[…]]" doubled wrapping
    expect(out).toBe(`[${BAND}]`)
  })

  it('does not double-wrap a single complex bracketed text', () => {
    expect(getReferenceRangeText([{ text: '[Target Not Detected]' }])).toBe('[Target Not Detected]')
  })

  it('still parses a plain "[lo][hi]" numeric range', () => {
    expect(getReferenceRangeText([{ text: '[3.9][10.6]' }])).toBe('[3.9–10.6]')
  })

  it('structured low/high is unaffected', () => {
    expect(getReferenceRangeText([{ low: { value: 8, unit: 'mg/dL' }, high: { value: 20, unit: 'mg/dL' } }])).toBe('[8–20 mg/dL]')
  })

  it('non-doubled text is returned untouched (odd length, no "][" seam)', () => {
    expect(getReferenceRangeText([{ text: '[Negative]' }])).toBe('[Negative]')
  })
})
