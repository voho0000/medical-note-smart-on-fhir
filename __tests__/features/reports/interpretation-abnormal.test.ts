// Regression locks for the app-wide abnormal-flag policy (2026-07-10):
//   1. Observation.interpretation (a FHIR array) is authoritative.
//   2. Only when NO interpretation exists → audited source reference ranges.
//   3. referenceRange.text is parsed only for simple safe forms.
// The concrete bug: Bridge v1.3.13 A22259XXXX blood panel showed 9/10 red even
// though every Observation.interpretation was N, because getInterpretationTag
// couldn't read the array shape and the code fell back to parsing the garbage
// "[4180 ~ 9380][4180 ~ 9380]" referenceRange text.
import {
  getInterpretationTag,
  isInterpretationAbnormal,
  checkReferenceRangeAbnormal,
  isReferenceRangeAssessmentUnavailable,
  isObservationAbnormal,
} from '@/src/shared/utils/interpretation-helpers'

describe('getInterpretationTag — array vs single shape', () => {
  it('reads the FHIR array shape [{coding:[{code}]}] (the v1.3.13 bug)', () => {
    const tag = getInterpretationTag([{ coding: [{ code: 'N', display: 'Normal' }] }] as any)
    expect(tag?.label).toBe('Normal')
  })

  it('still reads a single CodeableConcept', () => {
    expect(getInterpretationTag({ coding: [{ code: 'H' }] })?.label).toBe('High')
  })

  it('NR / nonreactive → Negative (not an unknown/abnormal tag)', () => {
    expect(getInterpretationTag({ coding: [{ code: 'NR' }] })?.label).toBe('Negative')
  })
})

describe('isInterpretationAbnormal', () => {
  it.each(['H', 'HH', 'L', 'LL', 'A', 'AA', 'CRIT-HI', 'CRIT-LO', 'POS', 'REACTIVE'])(
    'code %s → abnormal',
    (code) => {
      expect(isInterpretationAbnormal(getInterpretationTag({ coding: [{ code }] }))).toBe(true)
    },
  )

  it.each(['N', 'NORMAL', 'NEG', 'NEGATIVE', 'NR', 'NONREACTIVE'])(
    'code %s → NOT abnormal',
    (code) => {
      expect(isInterpretationAbnormal(getInterpretationTag({ coding: [{ code }] }))).toBe(false)
    },
  )

  it('unrecognised code → NOT abnormal (never a false red flag)', () => {
    expect(isInterpretationAbnormal(getInterpretationTag({ coding: [{ code: 'IND' }] }))).toBe(false)
  })
})

describe('checkReferenceRangeAbnormal — audited source ranges', () => {
  it('flags value above structured high', () => {
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 24 }, referenceRange: [{ high: { value: 20 } }] })).toBe(true)
  })
  it('flags value below structured low', () => {
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 5 }, referenceRange: [{ low: { value: 8 } }] })).toBe(true)
  })
  it('within structured range → not abnormal', () => {
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 12 }, referenceRange: [{ low: { value: 8 }, high: { value: 20 } }] })).toBe(false)
  })
  it('ignores reversed structured ranges instead of flagging everything', () => {
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 20 }, referenceRange: [{ low: { value: 41 }, high: { value: 0 } }] })).toBe(false)
  })
  it('ignores referenceRange.text garbage bracket form', () => {
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 5640 }, referenceRange: [{ text: '[4180 ~ 9380][4180 ~ 9380]' }] })).toBe(false)
  })
  it('parses simple text ranges safely', () => {
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 42 }, referenceRange: [{ text: '0~41' }] })).toBe(true)
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 41 }, referenceRange: [{ text: '0~41' }] })).toBe(false)
  })
  it('parses simple upper/lower bound text', () => {
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 6 }, referenceRange: [{ text: '＜5' }] })).toBe(true)
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 4 }, referenceRange: [{ text: '<5' }] })).toBe(false)
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 4 }, referenceRange: [{ text: '>5' }] })).toBe(true)
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 6 }, referenceRange: [{ text: '>5' }] })).toBe(false)
  })
  it('ignores reversed text ranges', () => {
    expect(checkReferenceRangeAbnormal({ valueQuantity: { value: 20 }, referenceRange: [{ text: '41~0' }] })).toBe(false)
  })
})

describe('isReferenceRangeAssessmentUnavailable', () => {
  const complexAdultPedsRange = '[[0-14d]4.94-27.48 [15-30d]7.8-15.91 [31d-0.5y]6.0-14.99 [0.5y-6y]4.86-13.51 [6y-18y]3.84-11.4 [≧18y]M 3.54-9.06 F 3.54-9.06, (2019/7/1起 ≧18years 變更為 3.25-9.16)]'

  it('flags complex numeric range text as unassessed, not abnormal', () => {
    const obs = { valueQuantity: { value: 6.11 }, referenceRange: [{ text: complexAdultPedsRange }] }
    expect(checkReferenceRangeAbnormal(obs)).toBe(false)
    expect(isReferenceRangeAssessmentUnavailable(obs)).toBe(true)
  })

  it('does not show unassessed when a simple range was audited successfully', () => {
    expect(isReferenceRangeAssessmentUnavailable({ valueQuantity: { value: 42 }, referenceRange: [{ text: '0~41' }] })).toBe(false)
  })

  it('does not show unassessed for no-range placeholders', () => {
    expect(isReferenceRangeAssessmentUnavailable({ valueQuantity: { value: 0 }, referenceRange: [{ text: '[.]' }] })).toBe(false)
  })

  it('does not show unassessed when source interpretation is present', () => {
    expect(isReferenceRangeAssessmentUnavailable({
      valueQuantity: { value: 6.11 },
      referenceRange: [{ text: complexAdultPedsRange }],
      interpretation: [{ coding: [{ code: 'N' }] }],
    })).toBe(false)
  })
})

describe('isObservationAbnormal — the single authority', () => {
  it('interpretation=N (array) beats garbage referenceRange text → not abnormal', () => {
    const wbc = {
      valueQuantity: { value: 5640 },
      referenceRange: [{ text: '[4180 ~ 9380][4180 ~ 9380]' }],
      interpretation: [{ coding: [{ code: 'N' }] }],
    }
    expect(isObservationAbnormal(wbc)).toBe(false)
  })

  it('interpretation=N beats a STRUCTURED range that would otherwise flag it', () => {
    const obs = {
      valueQuantity: { value: 999 },
      referenceRange: [{ low: { value: 1 }, high: { value: 10 } }],
      interpretation: [{ coding: [{ code: 'N' }] }],
    }
    expect(isObservationAbnormal(obs)).toBe(false)
  })

  it('interpretation=H → abnormal', () => {
    expect(isObservationAbnormal({ valueQuantity: { value: 5 }, interpretation: [{ coding: [{ code: 'H' }] }] })).toBe(true)
  })

  it('no interpretation → structured range decides (above high → abnormal)', () => {
    expect(isObservationAbnormal({ valueQuantity: { value: 24 }, referenceRange: [{ high: { value: 20 } }] })).toBe(true)
  })

  it('no interpretation + unsafe text range → not abnormal', () => {
    expect(isObservationAbnormal({ valueQuantity: { value: 5640 }, referenceRange: [{ text: '[4180 ~ 9380][4180 ~ 9380]' }] })).toBe(false)
  })

  it('no interpretation + simple source text range can flag abnormal', () => {
    expect(isObservationAbnormal({ valueQuantity: { value: 75.68 }, referenceRange: [{ text: '<5' }] })).toBe(true)
  })

  it('full 10-obs v1.3.13 panel (all interpretation=N) → 0 abnormal', () => {
    const panel = [
      { code: { text: '白血球計數' }, valueQuantity: { value: 5640 } },
      { code: { text: 'HB' }, valueQuantity: { value: 13.2 } },
      { code: { text: 'PLT' }, valueQuantity: { value: 187000 } },
      { code: { text: 'NEU' }, valueQuantity: { value: 55.7 } },
      { code: { text: 'LYM' }, valueQuantity: { value: 32.6 } },
      { code: { text: 'MONO' }, valueQuantity: { value: 7.6 } },
      { code: { text: 'EOS' }, valueQuantity: { value: 3.2 } },
      { code: { text: 'BASO' }, valueQuantity: { value: 0.9 } },
      { code: { text: 'ANC' }, valueQuantity: { value: 3141 } },
      { code: { text: 'RBC' }, valueQuantity: { value: 4.5 } },
    ].map(o => ({ ...o, referenceRange: [{ text: '[x ~ y][x ~ y]' }], interpretation: [{ coding: [{ code: 'N' }] }] }))
    expect(panel.filter(isObservationAbnormal).length).toBe(0)
  })
})
