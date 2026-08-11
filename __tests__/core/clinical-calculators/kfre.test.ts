import {
  calculateKfre,
  KFRE_FOUR_VARIABLE_MODEL,
} from '@/src/core/clinical-calculators/kfre'
import {
  calculateKfre as governedCalculateKfre,
  KFRE_FOUR_VARIABLE_MODEL as GOVERNED_KFRE_MODEL,
} from '@voho0000/personalized-care'

describe('four-variable KFRE domain calculator', () => {
  it('is the same implementation the CKD guidance card uses', () => {
    // The equation was previously duplicated in this repo and in the care
    // package, so a coefficient fix in one place left the other reporting a
    // different risk for the same patient. Identity, not equality: a re-fork
    // must fail here.
    expect(calculateKfre).toBe(governedCalculateKfre)
    expect(KFRE_FOUR_VARIABLE_MODEL).toBe(GOVERNED_KFRE_MODEL)
  })

  it('reproduces the published non-North-American equation for a worked case', () => {
    const result = calculateKfre({
      ageYears: 72,
      sex: 'male',
      egfrMlMin173m2: 35,
      urineAcrMgG: 450,
      calibration: 'non-north-america',
    })

    expect(result).not.toBeNull()
    expect(result!.linearPredictor).toBeCloseTo(0.63349, 5)
    expect(result!.twoYearRiskPercent).toBeCloseTo(3.1419, 4)
    expect(result!.fiveYearRiskPercent).toBeCloseTo(11.6278, 4)
  })

  it('keeps regional calibration explicit and produces lower risk outside North America', () => {
    const input = {
      ageYears: 70,
      sex: 'male' as const,
      egfrMlMin173m2: 30,
      urineAcrMgG: 200,
    }
    const northAmerica = calculateKfre({ ...input, calibration: 'north-america' })
    const nonNorthAmerica = calculateKfre({ ...input, calibration: 'non-north-america' })

    expect(KFRE_FOUR_VARIABLE_MODEL.baselineSurvival['north-america']).toEqual({
      twoYear: 0.975,
      fiveYear: 0.924,
    })
    expect(KFRE_FOUR_VARIABLE_MODEL.baselineSurvival['non-north-america']).toEqual({
      twoYear: 0.9832,
      fiveYear: 0.9365,
    })
    expect(nonNorthAmerica!.twoYearRisk).toBeLessThan(northAmerica!.twoYearRisk)
    expect(nonNorthAmerica!.fiveYearRisk).toBeLessThan(northAmerica!.fiveYearRisk)
  })

  it('does not extrapolate outside adults with CKD G3-G5 or accept non-positive ACR', () => {
    const valid = {
      ageYears: 60,
      sex: 'female' as const,
      egfrMlMin173m2: 45,
      urineAcrMgG: 30,
      calibration: 'non-north-america' as const,
    }

    expect(calculateKfre({ ...valid, ageYears: 17 })).toBeNull()
    expect(calculateKfre({ ...valid, egfrMlMin173m2: 60 })).toBeNull()
    expect(calculateKfre({ ...valid, urineAcrMgG: 0 })).toBeNull()
    expect(calculateKfre({ ...valid, urineAcrMgG: Number.NaN })).toBeNull()
  })
})
