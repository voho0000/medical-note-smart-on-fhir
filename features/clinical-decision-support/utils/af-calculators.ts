/** Input/provenance handoff only. Every formula is owned by medical-calculator. */
import {
  collectAfCalculatorInputs,
  collectAfTtrInputs,
  collectAfBleedingInputs,
  type CdssPatientProfile,
} from '@voho0000/personalized-care'
import {
  calculateAfTtr,
  calculateHasBled,
} from '@/features/medical-calculator/calculators/af-followup'
import { AF_STROKE } from '@/features/medical-calculator/calculators/af-stroke'
import { RENAL } from '@/features/medical-calculator/calculators/renal'

const calculators = [...AF_STROKE, ...RENAL.filter((calc) => calc.id === 'crcl-cockcroft-gault')]

export function applyAfCalculatorResults(profile: CdssPatientProfile): CdssPatientProfile {
  const inputs = collectAfCalculatorInputs(profile, 'en')
  const results = { ...profile.medicalCalculatorResults }
  for (const calc of calculators) {
    // Delete before computing so invalid/new patient inputs cannot retain an old result.
    delete results[calc.id]
    const values = inputs.values[calc.id as keyof typeof inputs.values]
    const result = calc.compute(values)
    if (result?.numericValue === undefined || !Number.isFinite(result.numericValue)) continue
    results[calc.id] = {
      calculatorId: calc.id,
      version: calc.version!,
      numericValue: result.numericValue,
      complete: result.completeness?.complete ?? true,
      upperBound: result.completeness?.upperBound,
      missingInputs: result.completeness?.missingKeys ?? [],
      inputSignature: JSON.stringify(values),
      evaluatedAt: profile.evaluatedAt,
    }
  }
  const ttrInputs = collectAfTtrInputs(profile)
  const afTtr = { ...calculateAfTtr(ttrInputs), inputSignature: JSON.stringify(ttrInputs) }
  const bleeding = collectAfBleedingInputs({ ...profile, afTtr })
  results['has-bled'] = {
    ...calculateHasBled(bleeding),
    calculatorId: 'has-bled',
    version: '1.1.0',
    inputSignature: JSON.stringify(bleeding),
    evaluatedAt: profile.evaluatedAt,
  }
  return { ...profile, afTtr, medicalCalculatorResults: results }
}
