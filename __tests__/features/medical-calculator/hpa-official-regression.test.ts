import { calculateHpaRisks } from '@/features/medical-calculator/hpa-risk-model'
import type { CalcValues } from '@/features/medical-calculator/types'
import holdout from './fixtures/hpa-official-holdout.json'
import research from './fixtures/hpa-official-research-2026-09-16.json'
import historicalBlind from './fixtures/hpa-official-blind-2026-09-16.json'
import precision1 from './fixtures/hpa-official-precision-1-2026-09-16.json'
import precision2 from './fixtures/hpa-official-precision-2-2026-09-16.json'
import precision3 from './fixtures/hpa-official-precision-3-2026-09-16.json'
import firstValidation from './fixtures/hpa-official-validation-1-2026-09-16.json'
import adaptive from './fixtures/hpa-official-adaptive-2026-09-16.json'
import secondValidation from './fixtures/hpa-official-validation-2-2026-09-16.json'
import thirdValidation from './fixtures/hpa-official-validation-3-2026-09-16.json'
import adaptiveHtn from './fixtures/hpa-official-adaptive-htn-2026-09-16.json'
import fourthValidation from './fixtures/hpa-official-validation-4-2026-09-16.json'

interface OfficialCase {
  input: Record<string, number>
  official: number[]
  multipleDiff?: number[]
  hypertensionMultipleDiff?: number
}

function valuesFor(input: Record<string, number>): CalcValues {
  return {
    ...Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)])),
    gender: input.gender ? 'male' : 'female', diabetes: input.diabetes ? 'yes' : 'no',
    hbp: input.hbp ? 'yes' : 'no', smoke: input.smoke ? 'yes' : 'no', prior_cvd: 'no',
  }
}

function assertMatchesOfficial(records: OfficialCase[]) {
  let eligible = 0
  records.forEach((record, profile) => {
    const { input, official } = record
    calculateHpaRisks(valuesFor(input)).forEach((result, index) => {
      if (index === 1 && input.diabetes || index === 2 && input.hbp) {
        expect(result.status).toBe('existing')
        return
      }
      expect(result.status).toBe('estimated')
      eligible++
      const multiple = record.multipleDiff?.[index] ?? record.hypertensionMultipleDiff!
      const level = index === 2
        ? multiple < .75 ? 'low' : multiple > 1.25 ? 'high' : 'moderate'
        : official[index] >= 20 ? 'high' : official[index] >= 10 ? 'moderate' : 'low'
      // Include profile/outcome in failures, not just aggregate success counts.
      expect({ profile, outcome: result.outcome, risk: Math.trunc(result.risk!), level: result.level })
        .toEqual({ profile, outcome: result.outcome, risk: official[index], level })
    })
  })
  return eligible
}

describe('HPA saved official synthetic responses — exact display and grade', () => {
  it('matches every historical profile now used as calibration', () => {
    expect(assertMatchesOfficial([...holdout, ...research.records, ...historicalBlind.records])).toBe(1666)
  })

  it('matches the first boundary calibration batches, including the saved partial batch', () => {
    // The first batch stopped safely when the backend rejected fractional SBP.
    // Its 24 successful responses are valid calibration, not a completed batch.
    expect(precision1.records).toHaveLength(24)
    expect(precision2.complete).toBe(true)
    expect(assertMatchesOfficial([...precision1.records, ...precision2.records])).toBe(576)
  })

  it('matches every finer integer-boundary calibration profile', () => {
    expect(precision3.complete).toBe(true)
    expect(precision3.records).toHaveLength(360)
    expect(assertMatchesOfficial(precision3.records)).toBe(1737)
  })

  it('matches the former first validation and all adaptive calibration profiles', () => {
    expect(firstValidation.complete).toBe(true)
    expect(firstValidation.records).toHaveLength(528)
    expect(adaptive.complete).toBe(true)
    expect(adaptive.records).toHaveLength(200)
    expect(adaptive.rounds).toHaveLength(20)
    expect(assertMatchesOfficial([...firstValidation.records, ...adaptive.records])).toBe(3466)
  })

  it('matches the former second validation, now calibration for the third candidate', () => {
    expect(secondValidation.complete).toBe(true)
    expect(secondValidation.candidateSha256).toBe('990c82b9aeb068a910084f43b25e9936a54db2eb181361c727a88befd08d1806')
    expect(secondValidation.records).toHaveLength(530)
    const fresh = secondValidation.records.filter((record) => record.kind !== 'repeated-drift-anchor')
    expect(fresh).toHaveLength(528)
    expect(fresh.filter((record) => record.kind === 'fresh-validation-random')).toHaveLength(240)
    expect(fresh.filter((record) => record.kind === 'fresh-validation-htn-boundary')).toHaveLength(288)
    expect(assertMatchesOfficial(fresh)).toBe(2575)
  })

  it('checks repeated drift anchors separately rather than counting them as new profiles', () => {
    const anchors = secondValidation.records.filter((record) => record.kind === 'repeated-drift-anchor')
    expect(anchors).toHaveLength(2)
    for (const anchor of anchors) {
      const original = research.records.find((record) => Object.entries(anchor.input)
        .every(([key, value]) => (record.input as Record<string, number>)[key] === value))
      expect(original).toBeDefined()
      expect([anchor.official, anchor.populationAvg, anchor.multipleDiff])
        .toEqual([original!.official, original!.populationAvg, original!.multipleDiff])
    }
    expect(assertMatchesOfficial(anchors)).toBe(10)
  })

  it('matches the former third validation and the BMI-precision diagnostic batch', () => {
    expect(thirdValidation.complete).toBe(true)
    expect(thirdValidation.records).toHaveLength(530)
    // The continuous-BMI hypothesis failed in round 49. Preserve the actual
    // stop, not a fabricated 60-round completion. All saved responses count.
    expect(adaptiveHtn.complete).toBe(false)
    expect(adaptiveHtn.rounds).toHaveLength(49)
    expect(adaptiveHtn.records).toHaveLength(98)
    expect(assertMatchesOfficial([...thirdValidation.records, ...adaptiveHtn.records])).toBe(3061)
  })

  it('matches every fresh fourth-validation response without refitting the frozen BMI-four-decimal candidate', () => {
    expect(fourthValidation.complete).toBe(true)
    expect(fourthValidation.candidateSha256).toBe('409de5bb43b965083d5c5a65df3a90cc3493165085ef3bfbb6ae8fc674781f87')
    expect(fourthValidation.seed).toBe(9261694)
    expect(fourthValidation.records).toHaveLength(530)
    const fresh = fourthValidation.records.filter((record) => record.kind !== 'repeated-drift-anchor')
    expect(fresh).toHaveLength(528)
    expect(fresh.filter((record) => record.kind === 'fresh-validation-random')).toHaveLength(240)
    const boundaries = fresh.filter((record) => record.kind === 'fresh-validation-htn-boundary')
    expect(boundaries).toHaveLength(288)
    // Every sex/age has both sides of both public hypertension grade cuts.
    for (const gender of [0, 1]) {
      for (let age = 35; age <= 70; age++) {
        const cohort = boundaries.filter((record) => record.input.gender === gender && record.input.age === age)
        expect(cohort).toHaveLength(4)
        expect(cohort.map((record) => record.multipleDiff[2])).toEqual([.74, .75, 1.25, 1.26])
      }
    }
    const calibration = [
      ...holdout, ...research.records, ...historicalBlind.records,
      ...precision1.records, ...precision2.records, ...precision3.records,
      ...firstValidation.records, ...adaptive.records, ...secondValidation.records,
      ...thirdValidation.records, ...adaptiveHtn.records,
    ]
    const signature = (input: Record<string, number>) => JSON.stringify(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)))
    const seen = new Set(calibration.map((record) => signature(record.input)))
    for (const record of fresh) expect(seen.has(signature(record.input))).toBe(false)
    expect(new Set(fresh.map((record) => signature(record.input))).size).toBe(528)
    expect(assertMatchesOfficial(fresh)).toBe(2577)
  })

  it('keeps the fourth-validation repeated anchors out of the fresh validation count', () => {
    const anchors = fourthValidation.records.filter((record) => record.kind === 'repeated-drift-anchor')
    expect(anchors).toHaveLength(2)
    for (const anchor of anchors) {
      const original = research.records.find((record) => Object.entries(anchor.input)
        .every(([key, value]) => (record.input as Record<string, number>)[key] === value))
      expect(original).toBeDefined()
      expect([anchor.official, anchor.populationAvg, anchor.multipleDiff])
        .toEqual([original!.official, original!.populationAvg, original!.multipleDiff])
    }
    expect(assertMatchesOfficial(anchors)).toBe(10)
  })

  it('uses the two-decimal risk before integer truncation and grading', () => {
    // The continuous local estimates are just below 10 and 20; final direct
    // floor would disagree with these saved public responses and their grades.
    const nearTen = precision3.records[142]
    const nearTwenty = precision3.records[190]
    expect(nearTen.official[3]).toBe(10)
    expect(nearTwenty.official[0]).toBe(20)
    expect(calculateHpaRisks(valuesFor(nearTen.input))[3]).toMatchObject({ risk: 10, level: 'moderate' })
    expect(calculateHpaRisks(valuesFor(nearTwenty.input))[0]).toMatchObject({ risk: 20, level: 'high' })
    const saturated = historicalBlind.records.find((record) => record.official[1] === 100 && !record.input.diabetes)!
    expect(calculateHpaRisks(valuesFor(saturated.input))[1]).toMatchObject({ risk: 100, level: 'high' })
  })
})
