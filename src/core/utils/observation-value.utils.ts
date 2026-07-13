import { formatNumberSmart } from '@/src/shared/utils/number-format.utils'

export interface ObservationDisplayValue {
  value: string
  unit?: string
}

/** Every common FHIR Observation[x] scalar representation used by the app. */
export function observationDisplayValue(observation: any): ObservationDisplayValue | null {
  const quantity = observation?.valueQuantity
  if (quantity?.value !== undefined && quantity?.value !== null) {
    return {
      value: typeof quantity.value === 'number' ? formatNumberSmart(quantity.value) : String(quantity.value),
      unit: quantity.unit || quantity.code || undefined,
    }
  }
  if (observation?.valueString !== undefined && observation.valueString !== null) {
    return { value: String(observation.valueString) }
  }
  const concept = observation?.valueCodeableConcept
  const conceptText = concept?.text || concept?.coding?.[0]?.display || concept?.coding?.[0]?.code
  if (conceptText) return { value: String(conceptText) }
  for (const key of ['valueBoolean', 'valueInteger', 'valueDecimal', 'valueDateTime', 'valueDate', 'valueTime']) {
    const value = observation?.[key]
    if (value !== undefined && value !== null) return { value: String(value) }
  }
  if (observation?.valueRange) {
    const low = observation.valueRange.low?.value
    const high = observation.valueRange.high?.value
    const unit = observation.valueRange.low?.unit || observation.valueRange.high?.unit
    if (low !== undefined || high !== undefined) {
      return { value: `${low ?? '?'}–${high ?? '?'}`, unit }
    }
  }
  return null
}

/**
 * Component-only panels are valid FHIR. Expand them into observation-shaped
 * values while retaining the parent's date/category/status/reference ranges.
 */
export function expandObservationValues(observation: any): any[] {
  const expanded: any[] = []
  if (observationDisplayValue(observation)) expanded.push(observation)
  for (const component of observation?.component ?? []) {
    if (!observationDisplayValue(component)) continue
    expanded.push({
      ...observation,
      id: observation?.id ? `${observation.id}#component:${expanded.length}` : undefined,
      code: component.code || observation.code,
      valueQuantity: component.valueQuantity,
      valueString: component.valueString,
      valueCodeableConcept: component.valueCodeableConcept,
      valueBoolean: component.valueBoolean,
      valueInteger: component.valueInteger,
      valueDecimal: component.valueDecimal,
      valueDateTime: component.valueDateTime,
      valueDate: component.valueDate,
      valueTime: component.valueTime,
      valueRange: component.valueRange,
      interpretation: component.interpretation || observation.interpretation,
      referenceRange: component.referenceRange || observation.referenceRange,
      component: undefined,
    })
  }
  return expanded
}
