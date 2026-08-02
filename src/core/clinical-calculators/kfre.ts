/**
 * Four-variable Kidney Failure Risk Equation (KFRE).
 *
 * Host-facing facade only. The implementation lives in the governed care
 * package alongside the CKD guideline pack that reports the same risk, so the
 * medical-calculator tab and the "腎衰竭風險（KFRE）" decision card can never
 * compute different numbers for one patient. Do not re-implement the model
 * here: change it in `@voho0000/personalized-care` and release that package.
 *
 * Model:
 *   Tangri et al. JAMA 2011; coefficients and regional recalibration from
 *   Tangri et al. JAMA 2016.
 */

export type {
  KfreCalibration,
  KfreInput,
  KfreResult,
  KfreSex,
} from '@voho0000/personalized-care'

export {
  KFRE_FOUR_VARIABLE_MODEL,
  calculateKfre,
} from '@voho0000/personalized-care'
