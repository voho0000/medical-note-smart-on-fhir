import {
  HEART_FAILURE_PROGNOSIS,
  calculateLifePreserved,
  calculateMaggic,
  type LifePredictors,
} from '@/features/medical-calculator/calculators/heart-failure-prognosis'
import { parseCalculatorEcho } from '@/features/medical-calculator/echo-autofill'

const maggicValues = {
  age: '70', sex: 'male', lvef: '35', nyha: '2', creatinine: '1.1',
  diabetes: 'yes', betaBlocker: 'no', sbp: '125', bmi: '25',
  hfDuration: 'yes', smoker: 'no', copd: 'yes', aceiArb: 'no',
}

const lifePublishedExample: LifePredictors = {
  age: 75,
  sex: 'female',
  diabetes: false,
  smoker: false,
  priorHfHospitalization: true,
  recentHfHospitalization: false,
  copd: false,
  atrialFibrillation: true,
  nyhaHigh: false,
  ischemicHeartDisease: false,
  ntProBnp: 2120,
  bmi: 30,
  heartRate: 75,
  hemoglobinMmolL: 7.8,
  egfr: 55,
}

describe('heart failure prognosis calculators', () => {
  test('MAGGIC reproduces the published score-to-risk lookup', () => {
    const estimate = calculateMaggic(maggicValues)!
    expect(estimate.score).toBe(28)
    expect(estimate.oneYearRisk).toBe(.209)
    expect(estimate.threeYearRisk).toBe(.458)

    const result = HEART_FAILURE_PROGNOSIS[0].compute(maggicValues)!
    expect(result.value).toBe('28')
    expect(result.extra?.slice(0, 2).map(row => row.value)).toEqual(['20.9%', '45.8%'])
  })

  test('MAGGIC uses LVEF interactions and never treats missing choices as no', () => {
    expect(calculateMaggic({ ...maggicValues, diabetes: '' })).toBeNull()
    expect(calculateMaggic({ ...maggicValues, lvef: '29' })!.score)
      .toBeGreaterThan(calculateMaggic({ ...maggicValues, lvef: '40' })!.score)
    expect(calculateMaggic({ ...maggicValues, creatinine: '-1' })).toBeNull()
  })

  test('LIFE-Preserved reproduces the female example in Figure 3', () => {
    const estimate = calculateLifePreserved(lifePublishedExample)!
    expect(estimate.twoYearRisk).toBeCloseTo(.182, 3)
    expect(estimate.tenYearRisk).toBeCloseTo(.568, 3)
    expect(estimate.lifetimeRisk).toBeCloseTo(.662, 3)
    expect(estimate.lifetimeNonCvRisk).toBeCloseTo(.221, 3)
    expect(estimate.medianEventFreeAge).toBeCloseTo(80.4, 1)

    const result = HEART_FAILURE_PROGNOSIS[1].compute({
      age: '75', sex: 'female', lvef: '55', priorReducedLvef: 'no', diabetes: 'no', smoker: 'no',
      hfHospitalization: 'prior', copd: 'no', af: 'yes', nyha: 'low', ihd: 'no',
      ntprobnp: '2120', bmi: '30', heartRate: '75', hemoglobin: `${7.8 * 1.6113}`, egfr: '55',
    })!
    expect(result.extra?.[1].value).toBe('56.8%')
  })

  test('recent hospitalization is time-varying and increases early risk', () => {
    const prior = calculateLifePreserved(lifePublishedExample)!
    const recent = calculateLifePreserved({ ...lifePublishedExample, recentHfHospitalization: true })!
    expect(recent.twoYearRisk!).toBeGreaterThan(prior.twoYearRisk!)
  })

  test('LIFE-Preserved enforces HFpEF eligibility and complete categorical inputs', () => {
    const compute = HEART_FAILURE_PROGNOSIS[1].compute
    const values = {
      age: '75', sex: 'female', lvef: '55', priorReducedLvef: 'no', diabetes: 'no', smoker: 'no',
      hfHospitalization: 'prior', copd: 'no', af: 'yes', nyha: 'low', ihd: 'no',
      ntprobnp: '2120', bmi: '30', heartRate: '75', hemoglobin: `${7.8 * 1.6113}`, egfr: '55',
    }
    expect(compute(values)?.value).toBe('18.2%')
    expect(compute({ ...values, lvef: '49.9' })).toBeNull()
    expect(compute({ ...values, priorReducedLvef: 'yes' })).toBeNull()
    expect(compute({ ...values, hfHospitalization: '' })).toBeNull()
  })

  test('LIFE-Preserved rejects fractional/out-of-cohort ages and non-finite or unsupported inputs', () => {
    expect(calculateLifePreserved({ ...lifePublishedExample, age: 39.9 })).toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, age: 40 })).not.toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, age: 89 })).not.toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, age: 89.9 })).toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, age: 90 })).toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, age: Number.NaN })).toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, bmi: 55.1 })).toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, heartRate: 120.1 })).toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, egfr: 90.1 })).toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, ntProBnp: 20_001 })).toBeNull()
    expect(calculateLifePreserved({ ...lifePublishedExample, hemoglobinMmolL: 11.1 })).toBeNull()
  })

  test('LVEF point values auto-fill from echo, but ranges and inequalities do not', () => {
    expect(parseCalculatorEcho('LVEF: 55%')).toMatchObject({ lvef: 55 })
    expect(parseCalculatorEcho('LV ejection fraction = 42 %')).toMatchObject({ lvef: 42 })
    expect(parseCalculatorEcho('LVEF: 50–55%').lvef).toBeUndefined()
    expect(parseCalculatorEcho('LVEF: >50%').lvef).toBeUndefined()
  })

  test('LIFE-Preserved auto-fills only explicitly identified CKD-EPI eGFR', () => {
    const input = HEART_FAILURE_PROGNOSIS[1].inputs.find(candidate => candidate.key === 'egfr')
    expect(input?.source).toEqual({ kind: 'lab', keys: ['EGFR(EPI)'] })
  })
})
