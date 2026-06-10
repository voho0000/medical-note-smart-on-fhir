// Observation Helper Functions
import type { Observation } from '@/src/shared/types/fhir.types'

type Coding = { system?: string; code?: string; display?: string }

/**
 * A vital sign matcher — three strategies tried in order:
 *   1. LOINC code (the standards-compliant path).
 *   2. Alias codes from any system, case-insensitive — for vendors that
 *      ship custom code systems like
 *      `https://bestshape.example/mqtt/metric-code#heart-rate`.
 *   3. Display text / code.text keyword match (中英文), case-insensitive
 *      substring — last-resort fallback for vendors that lack standard
 *      codes entirely but write human-readable display strings.
 *
 * First match wins. Designed so we never silently misclassify: each
 * descriptor lists ONLY tokens that unambiguously identify the given
 * vital (don't put just "rate" in keywords — it'd match both heart rate
 * and respiratory rate).
 */
export type VitalDescriptor = {
  loinc?: string | string[]
  aliasCodes?: string[]
  displayKeywords?: string[]
}

/**
 * Check whether a CodeableConcept-bearing object (an Observation, or an
 * Observation.component) matches a vital descriptor. Exported so the
 * BP-panel component-walking logic can reuse it.
 */
export function matchesVital(
  codeable: { code?: { coding?: Coding[]; text?: string } } | undefined,
  d: VitalDescriptor
): boolean {
  if (!codeable?.code) return false
  const codings = codeable.code.coding ?? []
  // 1. LOINC code(s)
  const loincList = d.loinc ? (Array.isArray(d.loinc) ? d.loinc : [d.loinc]) : []
  if (loincList.length && codings.some((c) => c.code && loincList.includes(c.code))) {
    return true
  }
  // 2. Alias codes from any system.
  if (d.aliasCodes?.length) {
    const aliases = d.aliasCodes.map((s) => s.toLowerCase())
    if (codings.some((c) => c.code && aliases.includes(c.code.toLowerCase()))) {
      return true
    }
  }
  // 3. Display text / code.text keyword substring.
  if (d.displayKeywords?.length) {
    const haystack = [
      codeable.code.text ?? '',
      ...codings.map((c) => c.display ?? ''),
    ]
      .join(' ')
      .toLowerCase()
    if (d.displayKeywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return true
    }
  }
  return false
}

/**
 * Find the most recent Observation matching a vital descriptor.
 * Replaces the older `pickLatestByCode` which only honoured LOINC; kept
 * as a wrapper below so existing callers keep working.
 */
export function pickLatestByVital(
  list: Observation[] | null | undefined,
  descriptor: VitalDescriptor
): Observation | undefined {
  if (!list?.length) return undefined
  const filtered = list.filter((o) => matchesVital(o, descriptor))
  filtered.sort((a, b) => {
    const dateA = a.effectiveDateTime ? new Date(a.effectiveDateTime).getTime() : 0
    const dateB = b.effectiveDateTime ? new Date(b.effectiveDateTime).getTime() : 0
    return dateB - dateA
  })
  return filtered[0]
}

/** Backwards-compatible LOINC-only matcher kept for non-vital call sites. */
export function pickLatestByCode(
  list: Observation[] | null | undefined,
  loinc: string
): Observation | undefined {
  return pickLatestByVital(list, { loinc })
}

export function filterVitalSigns(observations: any[]): Observation[] {
  if (!observations || observations.length === 0) return []

  return observations.filter((obs): obs is Observation => {
    if (!obs || typeof obs !== 'object') return false

    const isVitalSign = obs.category?.some(
      (cat: any) => Array.isArray(cat.coding) &&
      cat.coding.some((c: any) => c?.code === 'vital-signs')
    )

    return !!isVitalSign
  })
}
