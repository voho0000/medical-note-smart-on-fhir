// Regression locks for formatValue's abnormal-flag derivation. The
// cumulative report colours cells red based on `isAbnormal`, so each
// HL7 v3 ObservationInterpretation code must be classified correctly:
// serology "negative" / "non-reactive" results must NOT be flagged
// abnormal (they're the desired outcome for infection tests).
import { formatValue } from '@/features/clinical-summary/reports/hooks/useLabPivot'

function makeObs(interpCode: string | undefined, opts: { value?: any; valueString?: string } = {}) {
  return {
    code: { text: 'Test' },
    interpretation: interpCode ? [{ coding: [{ code: interpCode }] }] : undefined,
    valueQuantity: opts.value !== undefined ? { value: opts.value, unit: 'x' } : undefined,
    valueString: opts.valueString,
  }
}

describe('formatValue — isAbnormal vs interpretation code', () => {
  describe('normal-equivalent codes (should NOT be flagged abnormal)', () => {
    it.each(['N', 'NORMAL', 'NEG', 'NEGATIVE', 'NR', 'NONREACTIVE', 'n', 'neg', 'nonreactive'])(
      'interpretation "%s" → isAbnormal=false',
      (code) => {
        const fv = formatValue(makeObs(code, { valueString: 'Nonreactive(0.10 S/CO)' }))
        expect(fv.isAbnormal).toBe(false)
      },
    )
  })

  describe('abnormal codes (should be flagged)', () => {
    it.each(['H', 'L', 'A', 'ABN', 'ABNORMAL', 'POS', 'POSITIVE', 'REACTIVE', 'DETECTED', 'HH', 'LL', 'CRIT-HI', 'CRIT-LO'])(
      'interpretation "%s" → isAbnormal=true',
      (code) => {
        const fv = formatValue(makeObs(code, { value: 5 }))
        expect(fv.isAbnormal).toBe(true)
      },
    )
  })

  describe('no interpretation code → falls back to referenceRange numeric check', () => {
    it('numeric value within range → not abnormal', () => {
      const obs = {
        code: { text: 'BUN' },
        valueQuantity: { value: 12, unit: 'mg/dL' },
        referenceRange: [{ low: { value: 8 }, high: { value: 20 } }],
      }
      expect(formatValue(obs).isAbnormal).toBe(false)
    })

    it('numeric value above high → abnormal', () => {
      const obs = {
        code: { text: 'BUN' },
        valueQuantity: { value: 24, unit: 'mg/dL' },
        referenceRange: [{ low: { value: 8 }, high: { value: 20 } }],
      }
      expect(formatValue(obs).isAbnormal).toBe(true)
    })

    it('qualitative string with no interpretation → not abnormal (we can\'t derive)', () => {
      // Without interp code AND without numeric value, we have nothing
      // to compare against — must leave isAbnormal=false rather than guess.
      const obs = {
        code: { text: 'Anti-HCV' },
        valueString: 'Nonreactive(0.10 S/CO)',
      }
      expect(formatValue(obs).isAbnormal).toBe(false)
    })
  })

  describe('Anti-HCV / HBsAg real-world bundle shape (regression: red Nonreactive)', () => {
    // Pulled from v0.9.9 bundle; bridge correctly tags interpretation
    // code=NEG, app must respect it.
    const antiHCV = {
      code: {
        text: 'Anti-HCV',
        coding: [{ system: 'http://loinc.org', code: '13955-0' }],
      },
      valueString: 'Nonreactive(0.10 S/CO)',
      interpretation: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
          code: 'NEG',
          display: 'Negative',
        }],
      }],
      referenceRange: [{ text: '[N][N]' }],
    }

    it('Anti-HCV with interpretation=NEG is not abnormal (no red cell)', () => {
      expect(formatValue(antiHCV).isAbnormal).toBe(false)
    })
  })

  describe('interpretation wins over referenceRange (Bridge v1.3.13 false-abnormal bug)', () => {
    // Real A22259XXXX blood panel: interpretation=N, but referenceRange.text is
    // the health-passbook duplicated-bracket form "[4180 ~ 9380][4180 ~ 9380]".
    // App must NOT re-parse that text; the source's N is authoritative.
    const wbc = {
      code: { text: '白血球計數' },
      valueQuantity: { value: 5640, unit: '/uL' },
      referenceRange: [{ text: '[4180 ~ 9380][4180 ~ 9380]' }],
      interpretation: [{ coding: [{ code: 'N', display: 'Normal' }] }],
    }
    it('WBC 5640 with interpretation=N is NOT abnormal despite garbage range text', () => {
      expect(formatValue(wbc).isAbnormal).toBe(false)
    })

    it('interpretation=N wins even when a STRUCTURED range would flag the value', () => {
      const obs = {
        code: { text: 'X' },
        valueQuantity: { value: 999, unit: 'x' },
        referenceRange: [{ low: { value: 1 }, high: { value: 10 } }],
        interpretation: [{ coding: [{ code: 'N' }] }],
      }
      expect(formatValue(obs).isAbnormal).toBe(false)
    })

    it('no interpretation + garbage referenceRange.text → NOT abnormal (text never parsed)', () => {
      const obs = {
        code: { text: '白血球計數' },
        valueQuantity: { value: 5640, unit: '/uL' },
        referenceRange: [{ text: '[4180 ~ 9380][4180 ~ 9380]' }],
      }
      expect(formatValue(obs).isAbnormal).toBe(false)
    })
  })

  describe('no app-invented ranges (HARDCODED_REF_RANGES removed)', () => {
    it('TSH out of the old hardcoded 0.35–4.94 band is NOT flagged without source signal', () => {
      // Previously the app carried a hardcoded TSH range and would flag this;
      // policy now: no interpretation + no structured range → not abnormal.
      const tsh = { code: { text: 'TSH' }, valueQuantity: { value: 8.2, unit: 'uIU/mL' } }
      expect(formatValue(tsh).isAbnormal).toBe(false)
    })
  })
})
