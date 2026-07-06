// Locks the "inline card result" gating/safety behavior added in the audit
// pass: only fully data-driven calculators may show a bare result on the
// list card (never one built from a clinical-judgment default), the result
// carries a staleness date, and a throwing compute() degrades to null
// instead of crashing the list.
import { isFullyAutofillable, computeAutofilledResult, resolveInput } from '@/features/medical-calculator/autofill-compute'
import { CALCULATORS } from '@/features/medical-calculator/calculators'
import type { CalculatorDef, CalcInput } from '@/features/medical-calculator/types'
import type { Autofill, AutofillValue } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'

function fakeAutofill(values: Record<string, AutofillValue>, sex?: string): Autofill {
  return {
    sex,
    resolve: (source) => {
      if (!source) return undefined
      if (source.kind === 'age') return values.age
      if (source.kind === 'sex') return undefined
      if (source.kind === 'lab' || source.kind === 'labSpecimen') {
        for (const k of source.keys) if (values[k]) return values[k]
      }
      if (source.kind === 'vital' || source.kind === 'labLoinc') {
        for (const code of source.loinc) if (values[code]) return values[code]
      }
      return undefined
    },
  }
}

describe('resolveInput — unit-dimension safety gate for name matches', () => {
  const naInput: CalcInput = {
    key: 'na', type: 'number', label: { en: 'Sodium', zh: '鈉' },
    unit: 'mmol/L', dimension: 'electrolyte', source: { kind: 'lab', keys: ['NA'] },
  }
  const val = (unit: string, viaLoinc?: boolean): AutofillValue => ({ value: 141, unit, date: '2020-01-01', viaLoinc })

  it('rejects a NAME-matched value whose unit is dimension-incompatible', () => {
    // matched only by display name (viaLoinc:false), unit mg/dL is not an
    // electrolyte unit → probably a different analyte → do not fill
    const r = resolveInput(naInput, fakeAutofill({ NA: val('mg/dL', false) }))
    expect(r.filled).toBe(false)
    expect(r.value).toBe('')
  })

  it('accepts a name-matched value when the unit fits the dimension', () => {
    const r = resolveInput(naInput, fakeAutofill({ NA: val('mmol/L', false) }))
    expect(r.filled).toBe(true)
    expect(r.value).toBe('141')
  })

  it('does NOT reject a LOINC-matched value with an odd unit (trusted identity → ⚠ only)', () => {
    const r = resolveInput(naInput, fakeAutofill({ NA: val('mg/dL', true) }))
    expect(r.filled).toBe(true)
    expect(r.value).toBe('141')
    expect(r.unconvertible).toBe(true)
  })

  it('treats an untagged value (viaLoinc undefined) as trusted (no reject)', () => {
    const r = resolveInput(naInput, fakeAutofill({ NA: val('mg/dL') }))
    expect(r.filled).toBe(true)
  })
})

describe('isFullyAutofillable — real registry classification lock', () => {
  it('BMI is fully autofillable (weight + height are both vital sources)', () => {
    const bmi = CALCULATORS.find((c) => c.id === 'bmi')!
    expect(isFullyAutofillable(bmi)).toBe(true)
  })

  it('MELD-Na is NOT fully autofillable (dialysis select has no data source)', () => {
    const meldNa = CALCULATORS.find((c) => c.id === 'meld-na')!
    expect(isFullyAutofillable(meldNa)).toBe(false)
  })

  it('CHA2DS2-VASc is NOT fully autofillable (comorbidity selects are clinical judgment)', () => {
    const cha = CALCULATORS.find((c) => c.id === 'cha2ds2-vasc')!
    expect(isFullyAutofillable(cha)).toBe(false)
  })

  it('GDS-15 (a questionnaire) is NOT fully autofillable', () => {
    const gds = CALCULATORS.find((c) => c.id === 'gds-15')!
    expect(isFullyAutofillable(gds)).toBe(false)
  })
})

describe('computeAutofilledResult', () => {
  it('returns null for a calculator that is not fully autofillable', () => {
    const meldNa = CALCULATORS.find((c) => c.id === 'meld-na')!
    expect(computeAutofilledResult(meldNa, fakeAutofill({}))).toBeNull()
  })

  it('returns the result + the OLDEST source date among its inputs (staleness signal)', () => {
    const calc: CalculatorDef = {
      id: 'fake-two-input',
      name: { en: 'Fake', zh: 'Fake' },
      category: 'general',
      inputs: [
        { key: 'a', type: 'number', label: { en: 'A', zh: 'A' }, source: { kind: 'lab', keys: ['A'] } },
        { key: 'b', type: 'number', label: { en: 'B', zh: 'B' }, source: { kind: 'lab', keys: ['B'] } },
      ],
      compute: (v) => ({ value: String(Number(v.a) + Number(v.b)) }),
    }
    const autofill = fakeAutofill({
      A: { value: 1, unit: '', date: '2026-01-01T00:00:00Z' },
      B: { value: 2, unit: '', date: '2026-06-01T00:00:00Z' },
    })
    const r = computeAutofilledResult(calc, autofill)
    expect(r).not.toBeNull()
    expect(r!.result.value).toBe('3')
    expect(r!.asOf).toBe('2026-01-01T00:00:00Z') // the older of the two dates
  })

  it('asOf is null when no input carries a date (age-only calc)', () => {
    const calc: CalculatorDef = {
      id: 'fake-age-only',
      name: { en: 'Fake', zh: 'Fake' },
      category: 'general',
      inputs: [{ key: 'age', type: 'number', label: { en: 'Age', zh: 'Age' }, source: { kind: 'age' } }],
      compute: (v) => ({ value: v.age }),
    }
    const r = computeAutofilledResult(calc, fakeAutofill({ age: { value: 70, unit: 'y', date: '' } }))
    expect(r!.asOf).toBeNull()
  })

  it('a throwing compute() is caught and returns null instead of propagating', () => {
    const calc: CalculatorDef = {
      id: 'fake-throws',
      name: { en: 'Fake', zh: 'Fake' },
      category: 'general',
      inputs: [{ key: 'a', type: 'number', label: { en: 'A', zh: 'A' }, source: { kind: 'lab', keys: ['A'] } }],
      compute: () => { throw new Error('boom') },
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = computeAutofilledResult(calc, fakeAutofill({ A: { value: 1, unit: '', date: '' } }))
    expect(r).toBeNull()
    spy.mockRestore()
  })

  it('returns null when compute() returns null (missing/invalid data)', () => {
    const calc: CalculatorDef = {
      id: 'fake-returns-null',
      name: { en: 'Fake', zh: 'Fake' },
      category: 'general',
      inputs: [{ key: 'a', type: 'number', label: { en: 'A', zh: 'A' }, source: { kind: 'lab', keys: ['A'] } }],
      compute: () => null,
    }
    expect(computeAutofilledResult(calc, fakeAutofill({ A: { value: 1, unit: '', date: '' } }))).toBeNull()
  })

  it('suppresses the inline result when a sourced field falls back to its default (A-a gradient FiO₂ 21%)', () => {
    const aa = CALCULATORS.find((c) => c.id === 'aa-gradient')!
    const noFio2 = fakeAutofill({
      '2019-8': { value: 40, unit: 'mmHg', date: '2026-01-01' }, // PaCO2
      '2703-7': { value: 90, unit: 'mmHg', date: '2026-01-01' }, // PaO2
      age: { value: 60, unit: 'y', date: '' },
    })
    expect(computeAutofilledResult(aa, noFio2)).toBeNull() // FiO₂ defaulted → not truly auto
    const withFio2 = fakeAutofill({
      '3150-0': { value: 21, unit: '%', date: '2026-01-01' },
      '2019-8': { value: 40, unit: 'mmHg', date: '2026-01-01' },
      '2703-7': { value: 90, unit: 'mmHg', date: '2026-01-01' },
      age: { value: 60, unit: 'y', date: '' },
    })
    expect(computeAutofilledResult(aa, withFio2)).not.toBeNull()
  })

  it('suppresses the inline result for a sex-dependent calc when the patient sex is unknown', () => {
    const egfr = CALCULATORS.find((c) => c.id === 'egfr-ckd-epi-2021')!
    const data = { CREA: { value: 1, unit: 'mg/dL', date: '2026-01-01' }, age: { value: 60, unit: 'y', date: '' } }
    expect(computeAutofilledResult(egfr, fakeAutofill(data))).toBeNull() // no sex
    expect(computeAutofilledResult(egfr, fakeAutofill(data, 'male'))).not.toBeNull()
  })
})
