import type { Row } from '../types'

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
      const codings = component.code?.coding ?? []
      const label = [
        component.code?.text ?? '',
        ...codings.map((coding) => coding.display ?? ''),
      ].join(' ').toLowerCase()

      if (
        codings.some((coding) => coding.code === '8480-6')
        || /systolic\s+blood\s+pressure|收縮壓/.test(label)
      ) {
        hasSystolic = true
      }
      if (
        codings.some((coding) => coding.code === '8462-4')
        || /diastolic\s+blood\s+pressure|舒張壓/.test(label)
      ) {
        hasDiastolic = true
      }
    }
  }

  return hasSystolic && hasDiastolic
}
