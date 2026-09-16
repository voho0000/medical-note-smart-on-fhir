import { calculateHpaRisks, HPA_OUTCOMES } from '@/features/medical-calculator/hpa-risk-model'
import { HPA_RISK } from '@/features/medical-calculator/calculators/hpa-risk'
import { buildAutofill } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'
import { resolveInput } from '@/features/medical-calculator/autofill-compute'
import type { CalcValues } from '@/features/medical-calculator/types'
import holdout from './fixtures/hpa-official-holdout.json'
import research from './fixtures/hpa-official-research-2026-09-16.json'
import blind from './fixtures/hpa-official-blind-2026-09-16.json'

const baseline: CalcValues = {
  gender: 'male', age: '50', height: '170', weight: '70', waist: '85',
  sbp: '120', glu: '90', chol: '180', tg: '100', ldlc: '100', hdlc: '50',
  diabetes: 'no', hbp: 'no', smoke: 'no', prior_cvd: 'no',
}

describe('HPA five-risk offline reconstruction', () => {
  it('checks both baseline profiles against public-site synthetic responses', () => {
    const male = calculateHpaRisks(baseline)
    const female = calculateHpaRisks({ ...baseline, gender: 'female' })
    expect(male.map((r) => r.outcome)).toEqual(HPA_OUTCOMES)
    for (const [results, official] of [[male, [8, 16, 38, 8, 15]], [female, [9, 25, 45, 7, 12]]] as const) {
      results.forEach((result, index) => {
        expect(result.status).toBe('estimated')
        expect(Math.abs(result.risk! - official[index])).toBeLessThan(2)
      })
    }
  })

  it('checks independent high/low synthetic profiles from the held-out set', () => {
    const cases = [
      { values: { gender: 'female', age: '57', height: '172', weight: '87', waist: '115', sbp: '138', glu: '77', chol: '221', tg: '266', ldlc: '195', hdlc: '38', diabetes: 'yes', hbp: 'no', smoke: 'yes' }, official: [74, 56, 98, 66, 71] },
      { values: { gender: 'male', age: '39', height: '181', weight: '106', waist: '100', sbp: '97', glu: '111', chol: '187', tg: '158', ldlc: '149', hdlc: '55', diabetes: 'no', hbp: 'yes', smoke: 'no' }, official: [8, 53, 17, 2, 4] },
    ]
    for (const { values, official } of cases) {
      calculateHpaRisks({ ...values, prior_cvd: 'no' }).forEach((result, index) => {
        if (result.status !== 'estimated') return // Known disease is deliberately excluded.
        expect(Math.abs(result.risk! - official[index])).toBeLessThan(5)
      })
    }
  })

  it('rechecks the original 40 profiles, now historical calibration (180 eligible outcomes)', () => {
    let eligible = 0
    let exactDisplayedRisks = 0
    let matchingLevels = 0
    const errors: number[] = []
    for (const { input, official, hypertensionMultipleDiff } of holdout) {
      const values: CalcValues = {
        ...Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)])),
        gender: input.gender === 0 ? 'female' : 'male',
        diabetes: input.diabetes ? 'yes' : 'no',
        hbp: input.hbp ? 'yes' : 'no',
        smoke: input.smoke ? 'yes' : 'no',
        prior_cvd: 'no',
      }
      calculateHpaRisks(values).forEach((result, index) => {
        if (result.status === 'existing') return
        expect(result.status).toBe('estimated')
        eligible++
        if (Math.trunc(result.risk!) === official[index]) exactDisplayedRisks++
        const error = Math.abs(result.risk! - official[index])
        expect(error).toBeLessThan(5)
        errors.push(error)
        const officialLevel = index === 2
          ? hypertensionMultipleDiff < .75 ? 'low' : hypertensionMultipleDiff > 1.25 ? 'high' : 'moderate'
          : official[index] >= 20 ? 'high' : official[index] >= 10 ? 'moderate' : 'low'
        if (result.level === officialLevel) matchingLevels++
      })
    }
    expect(eligible).toBe(180)
    expect(exactDisplayedRisks).toBe(180)
    expect(errors.reduce((sum, error) => sum + error, 0) / eligible).toBeLessThan(1)
    expect(matchingLevels).toBe(180)
  })

  it('checks the former 40-profile follow-up holdout, now historical calibration', () => {
    const fresh = research.records.filter((record) => record.kind === 'fresh-holdout')
    expect(fresh).toHaveLength(40)
    let eligible = 0
    let exactDisplayedRisks = 0
    let matchingLevels = 0
    for (const { input, official, multipleDiff } of fresh) {
      const values: CalcValues = {
        ...Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)])),
        gender: input.gender === 0 ? 'female' : 'male',
        diabetes: input.diabetes ? 'yes' : 'no',
        hbp: input.hbp ? 'yes' : 'no',
        smoke: input.smoke ? 'yes' : 'no',
        prior_cvd: 'no',
      }
      calculateHpaRisks(values).forEach((result, index) => {
        if (result.status === 'existing') return
        expect(result.status).toBe('estimated')
        eligible++
        if (Math.trunc(result.risk!) === official[index]) exactDisplayedRisks++
        const officialLevel = index === 2
          ? multipleDiff[index] < .75 ? 'low' : multipleDiff[index] > 1.25 ? 'high' : 'moderate'
          : official[index] >= 20 ? 'high' : official[index] >= 10 ? 'moderate' : 'low'
        if (result.level === officialLevel) matchingLevels++
      })
    }
    expect(eligible).toBe(191)
    expect(exactDisplayedRisks).toBe(191)
    expect(matchingLevels).toBe(191)
  })

  it('checks the former 60-profile blind batch, now historical calibration', () => {
    expect(blind.records).toHaveLength(60)
    let eligible = 0
    let exactDisplayedRisks = 0
    let matchingLevels = 0
    for (const { input, official, multipleDiff } of blind.records) {
      const values: CalcValues = {
        ...Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)])),
        gender: input.gender === 0 ? 'female' : 'male',
        diabetes: input.diabetes ? 'yes' : 'no',
        hbp: input.hbp ? 'yes' : 'no',
        smoke: input.smoke ? 'yes' : 'no',
        prior_cvd: 'no',
      }
      calculateHpaRisks(values).forEach((result, index) => {
        if (result.status === 'existing') return
        expect(result.status).toBe('estimated')
        eligible++
        if (Math.trunc(result.risk!) === official[index]) exactDisplayedRisks++
        const officialLevel = index === 2
          ? multipleDiff[index] < .75 ? 'low' : multipleDiff[index] > 1.25 ? 'high' : 'moderate'
          : official[index] >= 20 ? 'high' : official[index] >= 10 ? 'moderate' : 'low'
        if (result.level === officialLevel) matchingLevels++
      })
    }
    expect(eligible).toBe(287)
    expect(exactDisplayedRisks).toBe(287)
    expect(matchingLevels).toBe(287)
  })

  it('never treats missing history as “no”, and calculates outcomes independently', () => {
    const pending = calculateHpaRisks({ ...baseline, diabetes: '', hbp: '', prior_cvd: '' })
    expect(pending[0].status).toBe('missing')
    expect(pending[1].status).toBe('missing')
    expect(pending[2].status).toBe('missing')
    expect(pending[3].status).toBe('missing')
    expect(calculateHpaRisks({ ...baseline, ldlc: '' }).map((r) => r.status)).toEqual(['estimated', 'estimated', 'missing', 'estimated', 'estimated'])
  })

  it('suppresses incident-risk estimates for known disease or diagnostic thresholds', () => {
    expect(calculateHpaRisks({ ...baseline, diabetes: 'yes' })[1]).toMatchObject({ status: 'existing', reason: 'known' })
    expect(calculateHpaRisks({ ...baseline, glu: '126' })[1]).toMatchObject({ status: 'existing', reason: 'threshold' })
    expect(calculateHpaRisks({ ...baseline, hbp: 'yes' })[2]).toMatchObject({ status: 'existing', reason: 'known' })
    expect(calculateHpaRisks({ ...baseline, sbp: '140' })[2]).toMatchObject({ status: 'existing', reason: 'threshold' })
    const prior = calculateHpaRisks({ ...baseline, prior_cvd: 'yes' })
    expect([prior[0], prior[3], prior[4]].map((r) => r.status)).toEqual(['existing', 'existing', 'existing'])
  })

  it('does not extrapolate past its sampled range', () => {
    expect(calculateHpaRisks({ ...baseline, age: '71' }).every((r) => r.status === 'outside')).toBe(true)
    expect(calculateHpaRisks({ ...baseline, age: '50.5' }).every((r) => r.status === 'outside')).toBe(true)
    expect(calculateHpaRisks({ ...baseline, waist: '130' })[0]).toMatchObject({ status: 'outside', outside: ['waist'] })
    expect(calculateHpaRisks({ ...baseline, sbp: '120.5' }).map((r) => r.status)).toEqual(['estimated', 'estimated', 'outside', 'outside', 'outside'])
  })

  it('autofills only explicitly fasting glucose and accepts a waist vital', () => {
    const fastingInput = HPA_RISK[0].inputs.find((input) => input.key === 'glu')!
    const waistInput = HPA_RISK[0].inputs.find((input) => input.key === 'waist')!
    const observations = [
      { code: { coding: [{ code: '2345-7' }] }, valueQuantity: { value: 160, unit: 'mg/dL' }, effectiveDateTime: '2026-09-15' },
      { code: { coding: [{ code: '1558-6' }] }, valueQuantity: { value: 95, unit: 'mg/dL' }, effectiveDateTime: '2026-09-14' },
      { code: { text: '腰圍' }, valueQuantity: { value: 89, unit: 'cm' }, effectiveDateTime: '2026-09-14' },
    ]
    const af = buildAutofill(observations, {})
    expect(resolveInput(fastingInput, af).value).toBe('95')
    expect(resolveInput(waistInput, af).value).toBe('89')
    expect(resolveInput(fastingInput, buildAutofill([observations[0]], {})).value).toBe('')
  })
})
