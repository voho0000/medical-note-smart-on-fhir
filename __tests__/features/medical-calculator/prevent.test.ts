import { PREVENT_ASCVD, PREVENT_RANGES } from '@/features/medical-calculator/calculators/prevent'
import { buildPreventReading } from '@/features/medical-calculator/prevent-reading'
import { buildPreventInputs } from '@/features/medical-calculator/prevent-inputs.store'
import { applyPreventReading } from '@/features/clinical-decision-support/utils/prevent-result'
import type { CdssPatientProfile } from '@voho0000/personalized-care'
const example = { age: '50', sex: 'female', tc: '240', hdl: '55', sbp: '160', bmi: '35', egfr: '90', dm: 'no', smoking: 'no', bpTx: 'yes', statin: 'no', cvd: 'no' }
const profile: CdssPatientProfile = { id: 'synthetic-prevent', facts: {}, evaluatedAt: '2026-09-12T00:00:00Z' }
const entries = (v: typeof example) => buildPreventInputs(Object.fromEntries(Object.entries(v).map(([key, value]) => [key, { value }])))
describe('PREVENT medical calculator', () => {
  it.each([['no', '3.6', 20], ['yes', '6.0', 26]])('matches the original paper female example, smoking=%s', (smoking, ten, thirty) => {
    const result = PREVENT_ASCVD.compute({ ...example, smoking })!
    expect(result.value).toBe(ten)
    expect(Math.round(result.risk.ascvd30!)).toBe(thirty)
  })
  it('uses distinct sex coefficients and limits 30-year estimates to ages 30–59', () => {
    expect(PREVENT_ASCVD.compute({ ...example, sex: 'male' })!.risk.ascvd10).toBeGreaterThan(PREVENT_ASCVD.compute(example)!.risk.ascvd10)
    expect(PREVENT_ASCVD.compute({ ...example, age: '59' })!.risk.ascvd30).toBeDefined()
    expect(PREVENT_ASCVD.compute({ ...example, age: '60' })!.risk.ascvd30).toBeUndefined()
    expect(PREVENT_ASCVD.compute({ ...example, age: '79' })).not.toBeNull()
  })
  it.each(Object.keys(example))('does not impute missing %s', key => expect(PREVENT_ASCVD.compute({ ...example, [key]: '' })).toBeNull())
  it.each(Object.entries(PREVENT_RANGES))('does not clamp %s into range', (key, range) => {
    expect(PREVENT_ASCVD.compute({ ...example, [key]: String(range[0] - 0.1) })).toBeNull()
    expect(PREVENT_ASCVD.compute({ ...example, [key]: String(range[1] + 0.1) })).toBeNull()
    expect(PREVENT_ASCVD.compute({ ...example, [key]: 'NaN' })).toBeNull()
  })
  it('blocks known CVD, including a chart diagnosis contradicting a prior answer', () => {
    expect(PREVENT_ASCVD.compute({ ...example, cvd: 'yes' })).toBeNull()
    const reading = buildPreventReading({ profile: { ...profile, facts: { heartFailureDiagnosis: { zh: 'HF', en: 'HF' } } }, inputs: entries(example) })
    expect(reading.excluded).toBe(true)
    expect(reading.result).toBeNull()
  })
  it('transports the exact calculator result and removes old results after missing input', () => {
    const reading = buildPreventReading({ profile, inputs: entries(example) })
    const applied = applyPreventReading(profile, reading)
    expect(applied.facts.preventAscvd10YearRisk.numericValue).toBe(reading.result!.risk.ascvd10)
    expect(applied.facts.preventAscvd10YearRisk.textEvidence?.matchedTerms).toContain('calculator:prevent-ascvd@base-ascvd-v1')
    expect(applyPreventReading(applied, buildPreventReading({ profile, inputs: entries({ ...example, smoking: '' }) })).facts.preventAscvd10YearRisk).toBeUndefined()
  })
  it('converts cholesterol units, retaining the input date', () => {
    const input = entries(example); const { tc: ignored, ...rest } = input.entries; void ignored
    const reading = buildPreventReading({ inputs: { entries: rest }, autofill: { resolve: source => source?.kind === 'lab' && source.keys.includes('CHOL') ? { value: 6.2, unit: 'mmol/L', date: '2026-08-01', viaLoinc: true } : undefined } })
    expect(Number(reading.values.tc)).toBeCloseTo(239.8, 0)
    expect(reading.inputs.find(row => row.key === 'tc')?.date).toBe('2026-08-01')
  })
  it('rejects an incompatible auto-filled unit', () => {
    const input = entries(example); const { tc: ignored, ...rest } = input.entries; void ignored
    const reading = buildPreventReading({ inputs: { entries: rest }, autofill: { resolve: source => source?.kind === 'lab' && source.keys.includes('CHOL') ? { value: 240, unit: 'bananas', date: '2026-08-01', viaLoinc: true } : undefined } })
    expect(reading.result).toBeNull()
    expect(reading.invalid).toContain('tc')
  })
})
