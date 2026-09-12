import type { CdssPatientProfile, CdssFactSource } from '@voho0000/personalized-care'
import { resolveInput } from './autofill-compute'
import { PREVENT_ASCVD, preventInvalidInputs, type PreventResult } from './calculators/prevent'
import type { Autofill } from './hooks/use-lab-autofill.hook'
import type { PreventInputs } from './prevent-inputs.store'
import type { CalcValues } from './types'

export interface PreventReading {
  values: CalcValues
  inputs: { key: string; date?: string; origin: 'manual' | 'record' | 'missing'; source?: CdssFactSource; invalidUnit?: boolean }[]
  invalid: string[]
  excluded: boolean
  result: PreventResult | null
}
const FACT_KEYS: Record<string, string> = { age: 'age', tc: 'totalCholesterol', hdl: 'HDL', egfr: 'eGFR', bmi: 'bodyMassIndex' }
const noAutofill: Autofill = { resolve: () => undefined }
/** Resolve once in Medical Calculator. CDSS only receives its typed output. */
export function buildPreventReading({ profile, autofill = noAutofill, inputs }: { profile?: CdssPatientProfile; autofill?: Autofill; inputs?: PreventInputs }): PreventReading {
  const values: CalcValues = {}
  const readings: PreventReading['inputs'] = []
  for (const input of PREVENT_ASCVD.inputs) {
    const resolved = resolveInput(input, autofill)
    const manual = inputs?.entries[input.key]
    const fact = profile?.facts[FACT_KEYS[input.key]]
    let value = manual ? manual.value : resolved.unconvertible ? '' : resolved.value
    let date = manual ? manual.measuredOn ?? manual.modifiedAt.slice(0, 10) : resolved.date
    let origin: PreventReading['inputs'][number]['origin'] = manual ? 'manual' : resolved.filled && !resolved.unconvertible ? 'record' : 'missing'
    // Core facts use normalized canonical units. An incompatible source is never silently replaced.
    if (!manual && !resolved.filled && fact?.numericValue !== undefined && Number.isFinite(fact.numericValue)) {
      value = String(fact.numericValue); date = fact.date ?? ''; origin = 'record'
    }
    if (!manual && input.key === 'dm' && profile?.facts.type2DiabetesDiagnosis) { value = 'yes'; origin = 'record' }
    if (!manual && input.key === 'statin' && profile?.medicationClassContexts?.statin?.state === 'confirmed-current') { value = 'yes'; origin = 'record' }
    if (input.key === 'cvd' && (profile?.facts.ascvdDiagnosis || profile?.facts.heartFailureDiagnosis)) { value = 'yes'; origin = 'record' }
    values[input.key] = value
    readings.push({ key: input.key, date: date || undefined, origin, invalidUnit: !manual && resolved.unconvertible,
      source: origin === 'manual' ? { resourceType: 'Patient', resourceId: `prevent-input:${input.key}`, sourceSystem: 'physician-input', date } : resolved.source?.obsId ? { resourceType: resolved.source.resourceType ?? 'Observation', resourceId: resolved.source.obsId, date } : fact?.sources?.[0],
    })
  }
  return { values, inputs: readings, invalid: preventInvalidInputs(values), excluded: values.cvd === 'yes', result: PREVENT_ASCVD.compute(values) }
}
