import { observationDisplayValue } from '@/src/core/utils/observation-value.utils'
import { getAnalyteLabel } from '@/src/shared/utils/lab-normalize'
import type { Row } from '../types'

// Match both the raw FHIR name and the canonical analyte label rendered by the
// reports UI (for example, a bridge-sent「鈉」observation is displayed as Na).
function nameMatch(obsOrComponent: any, query: string): boolean {
  const raw = (
    obsOrComponent?.code?.text
    || obsOrComponent?.code?.coding?.[0]?.display
    || ''
  ).toLowerCase()
  if (raw.includes(query)) return true

  const canonical = getAnalyteLabel(obsOrComponent)
  return canonical !== '—' && canonical.toLowerCase().includes(query)
}

/** Match the value exactly as a user sees it: comparator + result + unit. */
function resultMatch(obsOrComponent: any, query: string): boolean {
  const display = observationDisplayValue(obsOrComponent)
  if (!display) return false

  const comparator = obsOrComponent?.valueQuantity?.comparator ?? ''
  const searchableResult = `${comparator}${display.value}${display.unit ? ` ${display.unit}` : ''}`
  return searchableResult.toLowerCase().includes(query)
}

/**
 * Search observations nested inside a report row by analyte name or result.
 * Components are included because panel observations (blood pressure, CBC,
 * etc.) store their individual values there instead of on the parent.
 */
export function rowInnerMatch(row: Row, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return false

  return row.obs.some((observation: any) => {
    if (nameMatch(observation, query) || resultMatch(observation, query)) return true

    return Array.isArray(observation?.component)
      && observation.component.some((component: any) => (
        nameMatch(component, query) || resultMatch(component, query)
      ))
  })
}
