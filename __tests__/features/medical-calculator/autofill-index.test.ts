import { buildAutofill } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'

// Synthetic observations mimicking the bridge's FHIR shapes.
const bpPanel = (sys: number, dia: number, date: string) => ({
  effectiveDateTime: date,
  code: { coding: [{ code: '85354-9' }] }, // Blood pressure panel — no top-level value
  component: [
    { code: { coding: [{ code: '8480-6' }] }, valueQuantity: { value: sys, unit: 'mmHg' } },
    { code: { coding: [{ code: '8462-4' }] }, valueQuantity: { value: dia, unit: 'mmHg' } },
  ],
})
const labLoinc = (code: string, value: number, unit: string, date: string, specimen?: string) => ({
  effectiveDateTime: date,
  code: { coding: [{ code }] },
  valueQuantity: { value, unit },
  ...(specimen ? { specimen: { display: specimen } } : {}),
})

describe('buildAutofill — panel components (blood pressure)', () => {
  it('resolves systolic BP from a BP-panel component via vital LOINC 8480-6', () => {
    const af = buildAutofill([bpPanel(154, 88, '2020-01-01')], {})
    expect(af.resolve({ kind: 'vital', loinc: ['8480-6'] })).toMatchObject({ value: 154, unit: 'mmHg' })
    // diastolic too, proving component indexing is general
    expect(af.resolve({ kind: 'vital', loinc: ['8462-4'] })?.value).toBe(88)
  })

  it('keeps the latest panel when there are several', () => {
    const af = buildAutofill(
      [bpPanel(120, 80, '2019-05-01'), bpPanel(160, 95, '2021-06-01')],
      {},
    )
    expect(af.resolve({ kind: 'vital', loinc: ['8480-6'] })?.value).toBe(160)
  })

  it('a bare top-level lab still resolves (regression)', () => {
    const af = buildAutofill([labLoinc('2093-3', 200, 'mg/dL', '2020-01-01')], {})
    // 2093-3 → CHOL canonical
    expect(af.resolve({ kind: 'lab', keys: ['CHOL'] })?.value).toBe(200)
  })
})

describe('buildAutofill — ACR / PCR by LOINC', () => {
  it('ACR resolves via LOINC fallback 9318-7 (not in the canonical map)', () => {
    const af = buildAutofill([labLoinc('9318-7', 45, 'mg/g', '2020-01-01')], {})
    expect(af.resolve({ kind: 'labSpecimen', keys: ['ACR'], loinc: ['9318-7', '14959-1'], specimen: 'urine' })?.value).toBe(45)
  })

  it('ACR resolves via canonical + urine specimen (LOINC 14959-1)', () => {
    const af = buildAutofill([labLoinc('14959-1', 30, 'mg/g', '2020-01-01', 'Urine')], {})
    expect(af.resolve({ kind: 'labSpecimen', keys: ['ACR'], loinc: ['9318-7', '14959-1'], specimen: 'urine' })?.value).toBe(30)
  })

  it('PCR resolves via LOINC 2890-2', () => {
    const af = buildAutofill([labLoinc('2890-2', 600, 'mg/g', '2020-01-01')], {})
    expect(af.resolve({ kind: 'labLoinc', loinc: ['2890-2'] })?.value).toBe(600)
  })
})

describe('buildAutofill — derived urine ACR (microalbumin ÷ urine creatinine)', () => {
  const acrSource = { kind: 'labSpecimen' as const, keys: ['ACR'], loinc: ['9318-7', '14959-1'], specimen: 'urine' as const }

  it('derives ACR from same-day microalbumin (mg/L) and urine creatinine (mg/dL)', () => {
    // 80 mg/L ÷ (100 mg/dL = 1 g/L) = 80 mg/g
    const af = buildAutofill([
      labLoinc('14957-5', 80, 'mg/L', '2020-03-01'),
      labLoinc('2161-8', 100, 'mg/dL', '2020-03-01', 'Urine'),
    ], {})
    const r = af.resolve(acrSource)
    expect(r?.value).toBe(80)
    expect(r?.unit).toBe('mg/g')
  })

  it('converts a microalbumin reported in mg/dL', () => {
    // 8 mg/dL = 80 mg/L; ÷ 1 g/L = 80 mg/g
    const af = buildAutofill([
      labLoinc('14957-5', 8, 'mg/dL', '2020-03-01'),
      labLoinc('2161-8', 100, 'mg/dL', '2020-03-01', 'Urine'),
    ], {})
    expect(af.resolve(acrSource)?.value).toBe(80)
  })

  it('does NOT derive when the components are from different days', () => {
    const af = buildAutofill([
      labLoinc('14957-5', 80, 'mg/L', '2020-03-01'),
      labLoinc('2161-8', 100, 'mg/dL', '2020-04-15', 'Urine'),
    ], {})
    expect(af.resolve(acrSource)).toBeUndefined()
  })

  it('uses the most recent same-day pair', () => {
    const af = buildAutofill([
      labLoinc('14957-5', 40, 'mg/L', '2019-01-01'),
      labLoinc('2161-8', 100, 'mg/dL', '2019-01-01', 'Urine'),
      labLoinc('14957-5', 120, 'mg/L', '2021-06-01'),
      labLoinc('2161-8', 100, 'mg/dL', '2021-06-01', 'Urine'),
    ], {})
    expect(af.resolve(acrSource)?.value).toBe(120) // 120 / 1 g/L, latest day
  })

  it('a directly-reported numeric ACR takes precedence over derivation', () => {
    const af = buildAutofill([
      labLoinc('14957-5', 80, 'mg/L', '2020-03-01'),
      labLoinc('2161-8', 100, 'mg/dL', '2020-03-01', 'Urine'),
      labLoinc('9318-7', 45, 'mg/g', '2020-05-01'), // direct ACR
    ], {})
    expect(af.resolve(acrSource)?.value).toBe(45)
  })

  it('never pairs serum creatinine (only urine) into the ACR', () => {
    const af = buildAutofill([
      labLoinc('14957-5', 80, 'mg/L', '2020-03-01'),
      labLoinc('2160-0', 1.0, 'mg/dL', '2020-03-01', 'Blood'), // serum creatinine, same day
    ], {})
    expect(af.resolve(acrSource)).toBeUndefined()
  })
})
