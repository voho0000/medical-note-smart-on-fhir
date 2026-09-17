import type { Autofill } from '../hooks/use-lab-autofill.hook'
import type { AutofillSource } from '../types'
import type { PrognosisEvidence } from './models'
import { formatNum } from '../autofill-compute'

/** Read-only source preview, not unit-normalized or clinically confirmed model input. */
export function prognosisAutofillEvidence(autofill: Autofill): PrognosisEvidence {
  const sources: Record<string, AutofillSource> = {
    age: { kind: 'age' }, bodyMassIndex: { kind: 'bmi' },
    bloodPressure: { kind: 'vital', loinc: ['8480-6'], vital: 'sbp' },
    serumCreatinine: { kind: 'labSpecimen', keys: ['CREA'], loinc: ['2160-0'], specimen: 'blood' },
    sodium: { kind: 'labSpecimen', keys: ['NA'], loinc: ['2951-2'], specimen: 'blood' }, hemoglobin: { kind: 'lab', keys: ['HB'] },
  }
  return Object.fromEntries(Object.entries(sources).flatMap(([key, source]) => {
    const found = autofill.resolve(source)
    if (!found || !Number.isFinite(found.value)) return []
    return [[key, { value: `${formatNum(found.value)}${found.unit ? ` ${found.unit}` : ''}`, date: found.date, source: found.testName ?? found.obsId }]]
  }))
}
