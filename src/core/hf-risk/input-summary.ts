import type { HfInput } from './contract'
import { HF_LABS } from './labs'

/** Summarize only the projected single-hospital input, never unrelated raw chart data. */
export function summarizeHfInput(input: HfInput) {
  const resources = input.bundle.entry.map((entry: any) => entry.resource)
  const observations = resources.filter((item: any) => item.resourceType === 'Observation')
  const dates = [...new Set<string>(observations.map((item: any) => item.effectiveDateTime))].sort()
  const present = new Set(observations.flatMap((item: any) => item.code.coding.filter((code: any) => code.system.endsWith('/hf-source-lab-item')).map((code: any) => code.code)))
  const encounterClasses: Record<string, number> = {}
  for (const item of resources) if (item.resourceType === 'Encounter') encounterClasses[item.class?.code] = (encounterClasses[item.class?.code] ?? 0) + 1
  return {
    dates,
    presentLabs: HF_LABS.filter(lab => present.has(lab.key)).map(lab => lab.key),
    missingLabs: HF_LABS.filter(lab => !present.has(lab.key)).map(lab => lab.key),
    encounterClasses,
  }
}
