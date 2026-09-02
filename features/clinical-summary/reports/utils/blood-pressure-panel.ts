import type { Observation, Row } from '../types'
import { formatNumberSmart } from './number-format.utils'

type BloodPressureKind = 'systolic' | 'diastolic'

function bloodPressureKind(observation: Observation): BloodPressureKind | null {
  const codings = observation.code?.coding ?? []
  const label = [
    observation.code?.text ?? '',
    ...codings.map((coding) => coding.display ?? ''),
  ].join(' ').toLowerCase()

  if (
    codings.some((coding) => coding.code === '8480-6')
    || /systolic\s+blood\s+pressure|收縮壓/.test(label)
  ) {
    return 'systolic'
  }
  if (
    codings.some((coding) => coding.code === '8462-4')
    || /diastolic\s+blood\s+pressure|舒張壓/.test(label)
  ) {
    return 'diastolic'
  }
  return null
}

/**
 * True only for a composite observation that contains both systolic and
 * diastolic blood-pressure components. LOINC is authoritative; bilingual
 * labels cover source systems that omit standard coding.
 */
export function isSystolicDiastolicBloodPressureRow(row: Row): boolean {
  let hasSystolic = false
  let hasDiastolic = false

  for (const observation of row.obs) {
    for (const component of observation.component ?? []) {
      const kind = bloodPressureKind(component)
      if (kind === 'systolic') hasSystolic = true
      if (kind === 'diastolic') hasDiastolic = true
    }
  }

  return hasSystolic && hasDiastolic
}

/**
 * Compact clinical summary for a systolic/diastolic panel header. Showing the
 * actual reading is more useful than the parent Observation count (always
 * "1 item") while the expanded panel continues to expose the source values.
 */
export function getSystolicDiastolicBloodPressureSummary(row: Row): string | null {
  for (const observation of row.obs) {
    let systolic: Observation['valueQuantity']
    let diastolic: Observation['valueQuantity']

    for (const component of observation.component ?? []) {
      const quantity = component.valueQuantity
      if (quantity?.value == null) continue
      const kind = bloodPressureKind(component)
      if (kind === 'systolic' && !systolic) systolic = quantity
      if (kind === 'diastolic' && !diastolic) diastolic = quantity
    }

    if (systolic?.value == null || diastolic?.value == null) continue

    const systolicValue = formatNumberSmart(systolic.value)
    const diastolicValue = formatNumberSmart(diastolic.value)
    const systolicUnit = (systolic.unit || systolic.code)?.trim()
    const diastolicUnit = (diastolic.unit || diastolic.code)?.trim()

    if (systolicUnit && systolicUnit === diastolicUnit) {
      return `${systolicValue}/${diastolicValue} ${systolicUnit}`
    }

    const left = `${systolicValue}${systolicUnit ? ` ${systolicUnit}` : ''}`
    const right = `${diastolicValue}${diastolicUnit ? ` ${diastolicUnit}` : ''}`
    return `${left} / ${right}`
  }

  return null
}
