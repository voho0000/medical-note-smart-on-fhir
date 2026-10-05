import type { HfInput } from './contract'
import { HF_LABS } from './labs'

/** Summarize only the projected single-hospital input, never unrelated raw chart data. */
export function summarizeHfInput(input: HfInput) {
  const observations = input.bundle.entry.filter((entry: any) => entry.resource.resourceType === 'Observation').map((entry: any) => entry.resource)
  const dates = [...new Set<string>(observations.map((item: any) => item.effectiveDateTime))].sort()
  const present = new Set(observations.flatMap((item: any) => item.code.coding.filter((code: any) => code.system.endsWith('/hf-source-lab-item')).map((code: any) => code.code)))
  return { dates, missingLabs: HF_LABS.filter(lab => !present.has(lab.key)).map(lab => lab.key) }
}
