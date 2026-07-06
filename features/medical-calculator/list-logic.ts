// Pure list-building logic for the calculator browser — audience filtering,
// search matching, favorites/recent flat lists, and specialty grouping.
// Extracted from Feature.tsx so it can be unit-tested without rendering.

import type { CalcCategory, CalculatorDef } from './types'
import { PURPOSE_LABELS } from './types'
import { getCalcTags } from './calculators'

export const CATEGORY_ORDER: CalcCategory[] = [
  'renal', 'hepatic', 'gi', 'electrolyte', 'cardiac', 'pulmonary', 'heme', 'neuro', 'mental', 'general',
]

export type SpecialFilter = 'all' | 'favorites' | 'recent' | 'patient'
export type CalcFilter = CalcCategory | SpecialFilter

/** A calculator a patient can self-complete (audience 'patient' or 'both') —
 *  e.g. a questionnaire (GDS-15/PHQ-9) or a lay risk score. */
export function isPatientFillable(c: CalculatorDef): boolean {
  return c.audience === 'patient' || c.audience === 'both'
}

/** Patient mode shows only patient-appropriate calculators; medical shows all. */
export function forAudience(calcs: CalculatorDef[], audience: 'medical' | 'patient'): CalculatorDef[] {
  return calcs.filter((c) => audience === 'medical' || c.audience === 'patient' || c.audience === 'both')
}

/** Specialties (categories) that actually have at least one visible calculator,
 *  in canonical order — for the filter chip bar. */
export function specialtiesPresent(calcs: CalculatorDef[]): CalcCategory[] {
  return CATEGORY_ORDER.filter((cat) => calcs.some((c) => c.category === cat))
}

/** Build a search predicate. Matches name (en/zh), id, and disease + purpose
 *  tag text — so searching "中風" or "diagnosis" works, not just the title. */
export function makeMatcher(query: string): (c: CalculatorDef) => boolean {
  const q = query.trim().toLowerCase()
  return (c) => {
    if (!q) return true
    const tags = getCalcTags(c.id)
    const hay = [
      c.name.en, c.name.zh, c.id,
      ...tags.diseases.flatMap((d) => [d.en, d.zh]),
      ...tags.purpose.flatMap((p) => [PURPOSE_LABELS[p].en, PURPOSE_LABELS[p].zh]),
    ].join(' ').toLowerCase()
    return hay.includes(q)
  }
}

export interface CalcList {
  /** 'flat' for favorites/recent (curation order preserved), 'grouped' otherwise. */
  mode: 'flat' | 'grouped'
  flat: CalculatorDef[]
  grouped: { cat: CalcCategory; items: CalculatorDef[] }[]
}

/**
 * Turn the visible (already audience-filtered) calculators + the current
 * filter/query into the exact structure the list renders. Favorites/Recent are
 * flat lists in curation/recency order (grouping would bury the point);
 * everything else is grouped by specialty in canonical order, empty groups
 * dropped.
 */
export function buildCalcList(opts: {
  calcs: CalculatorDef[]
  filter: CalcFilter
  query: string
  favorites: string[]
  recent: string[]
}): CalcList {
  const { calcs, filter, query, favorites, recent } = opts
  const match = makeMatcher(query)

  if (filter === 'favorites' || filter === 'recent') {
    const ids = filter === 'favorites' ? favorites : recent
    const flat = ids
      .map((id) => calcs.find((c) => c.id === id))
      .filter((c): c is CalculatorDef => !!c && match(c))
    return { mode: 'flat', flat, grouped: [] }
  }

  const patientOnly = filter === 'patient'
  const filtered = calcs.filter((c) =>
    (filter === 'all' || patientOnly || c.category === filter) &&
    (!patientOnly || isPatientFillable(c)) &&
    match(c),
  )
  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: filtered.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length > 0)
  return { mode: 'grouped', flat: [], grouped }
}
