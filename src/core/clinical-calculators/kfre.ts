/**
 * Four-variable Kidney Failure Risk Equation (KFRE).
 *
 * Pure domain module: it has no React, FHIR, localization, or guideline-rendering
 * dependencies, so the medical-calculator UI, personalized guidance, and future
 * clinical workflows can all call the same implementation.
 *
 * Model:
 *   Tangri et al. JAMA 2011; coefficients and regional recalibration from
 *   Tangri et al. JAMA 2016.
 */

export type KfreSex = 'male' | 'female'
export type KfreCalibration = 'north-america' | 'non-north-america'

export interface KfreInput {
  ageYears: number
  sex: KfreSex
  egfrMlMin173m2: number
  urineAcrMgG: number
  /**
   * Required explicitly so a caller cannot silently apply the wrong regional
   * baseline. Taiwan and other non-North-American settings use
   * `non-north-america`.
   */
  calibration: KfreCalibration
}

export interface KfreResult {
  model: 'kfre-4-variable'
  calibration: KfreCalibration
  /** Cox-model centered linear predictor; exposed for auditability. */
  linearPredictor: number
  /** Probability on a 0–1 scale. */
  twoYearRisk: number
  /** Probability on a 0–1 scale. */
  fiveYearRisk: number
  /** Percentage on a 0–100 scale, without display rounding. */
  twoYearRiskPercent: number
  /** Percentage on a 0–100 scale, without display rounding. */
  fiveYearRiskPercent: number
}

export const KFRE_FOUR_VARIABLE_MODEL = {
  id: 'kfre-4-variable',
  coefficients: {
    agePer10Years: -0.2201,
    male: 0.2467,
    egfrPer5: -0.5567,
    logUrineAcrMgG: 0.4510,
  },
  centers: {
    agePer10Years: 7.036,
    male: 0.5642,
    egfrPer5: 7.222,
    logUrineAcrMgG: 5.137,
  },
  baselineSurvival: {
    'north-america': { twoYear: 0.9750, fiveYear: 0.9240 },
    'non-north-america': { twoYear: 0.9832, fiveYear: 0.9365 },
  },
} as const

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/**
 * Calculate treated kidney-failure risk (dialysis or kidney transplant).
 *
 * Returns null outside the validated population rather than extrapolating:
 * adults with CKD G3–G5 (eGFR >0 and <60) and a positive quantitative ACR.
 * ACR must be supplied in mg/g; callers receiving mg/mmol should convert it
 * before invoking the engine.
 */
export function calculateKfre(input: Readonly<KfreInput>): KfreResult | null {
  if (
    !Number.isFinite(input.ageYears)
    || input.ageYears < 18
    || !isFinitePositive(input.egfrMlMin173m2)
    || input.egfrMlMin173m2 >= 60
    || !isFinitePositive(input.urineAcrMgG)
    || (input.sex !== 'male' && input.sex !== 'female')
  ) {
    return null
  }

  const model = KFRE_FOUR_VARIABLE_MODEL
  const male = input.sex === 'male' ? 1 : 0
  const linearPredictor = (
    model.coefficients.agePer10Years
      * ((input.ageYears / 10) - model.centers.agePer10Years)
    + model.coefficients.male
      * (male - model.centers.male)
    + model.coefficients.egfrPer5
      * ((input.egfrMlMin173m2 / 5) - model.centers.egfrPer5)
    + model.coefficients.logUrineAcrMgG
      * (Math.log(input.urineAcrMgG) - model.centers.logUrineAcrMgG)
  )
  const relativeHazard = Math.exp(linearPredictor)
  const baseline = model.baselineSurvival[input.calibration]
  const twoYearRisk = 1 - Math.pow(baseline.twoYear, relativeHazard)
  const fiveYearRisk = 1 - Math.pow(baseline.fiveYear, relativeHazard)

  if (!Number.isFinite(twoYearRisk) || !Number.isFinite(fiveYearRisk)) return null

  return {
    model: model.id,
    calibration: input.calibration,
    linearPredictor,
    twoYearRisk,
    fiveYearRisk,
    twoYearRiskPercent: twoYearRisk * 100,
    fiveYearRiskPercent: fiveYearRisk * 100,
  }
}
