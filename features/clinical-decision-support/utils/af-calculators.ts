/** Input/provenance handoff only. Every formula is owned by medical-calculator. */
import { collectAfCalculatorInputs, type CdssPatientProfile } from '@voho0000/personalized-care'
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
  return { ...profile, medicalCalculatorResults: results }
}
