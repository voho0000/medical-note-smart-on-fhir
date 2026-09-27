// 我的固定檢驗 — the analytes a clinician pins for every patient, and how each
// one's latest result is read.
//
// Two separate questions live here, and they must never be answered by each
// other:
//  * Can the app recognise this analyte? — the catalog below. It is exactly the
//    canonical keys the lab taxonomy already places in a panel (LOINC first,
//    tested name aliases second). Anything outside it is "not supported yet";
//    the app does not build a match rule from free text the user typed.
//  * Does THIS patient have a result? — resolvePinnedLab. "No result in the
//    loaded data" is not "never tested", and it is not "unsupported".
//
// A pin is category-scoped (`chem:CREA`, not `CREA`): creatinine and WBC also
// exist as urine analytes, and a bare key would pull those in.

import { canonicalTestKeyFromString, CANONICAL_DISPLAY, CANONICAL_KEYS } from '@voho0000/clinical-lab-normalization/canonical'
import {
  CANONICAL_TO_LAY_EN,
  CANONICAL_TO_LAY_ZH,
  getAnalyteDisplayLabel,
} from '@voho0000/clinical-lab-normalization/display'
import { LAB_CATEGORIES } from './lab-categories'
import { getLabCompatibilityCanonicalDisplay, type LabCell, type LabPivot } from './lab-pivot.utils'

export const PINNED_LAB_REMINDER_PREFIX = 'note:'

export interface PinnableLab {
  /** `${categoryId}:${testKey}` — the stored identity of a pin. */
  id: string
  categoryId: string
  testKey: string
  /** Short clinical label (CREA, HbA1c, NT-proBNP) — also the default 名稱
   *  a copy format prints. */
  short: string
  /** Long-form name in each language, when the shared vocabulary has one. */
  nameZh?: string
  nameEn?: string
  /** Lower-cased search haystack: key, labels and the category's own name
   *  aliases that resolve to this key. */
  haystack: string
}

export function pinnedLabId(categoryId: string, testKey: string): string {
  return `${categoryId}:${testKey}`
}

export function parsePinnedLabId(id: string): { categoryId: string; testKey: string } | null {
  if (id.startsWith(PINNED_LAB_REMINDER_PREFIX)) return null
  const at = id.indexOf(':')
  if (at <= 0 || at === id.length - 1) return null
  return { categoryId: id.slice(0, at), testKey: id.slice(at + 1) }
}

export function isPinnedLabReminder(id: string): boolean {
  return id.startsWith(PINNED_LAB_REMINDER_PREFIX) && id.length > PINNED_LAB_REMINDER_PREFIX.length
}

export function pinnedLabReminderLabel(id: string): string {
  return id.slice(PINNED_LAB_REMINDER_PREFIX.length)
}

export function makePinnedLabReminder(label: string): string {
  return `${PINNED_LAB_REMINDER_PREFIX}${label.trim()}`
}

function shortLabel(testKey: string): string {
  return getLabCompatibilityCanonicalDisplay(testKey)
    ?? CANONICAL_DISPLAY[testKey]
    ?? (CANONICAL_KEYS.has(testKey) ? getAnalyteDisplayLabel(testKey, 'medical', 'en') : testKey)
}

function canonicalOf(code: string): string | null {
  try {
    return canonicalTestKeyFromString(code) ?? null
  } catch {
    return null
  }
}

/** Keys the taxonomy lists but real data never lands on. Bare EGFR resolves
 *  to EGFR(M) (see the chem pinnedColumns note in lab-categories), so a pin on
 *  it would sit empty forever beside the populated one. */
const NEVER_POPULATED = new Set(['chem:EGFR'])

let cachedCatalog: PinnableLab[] | null = null

/**
 * Every analyte the app can pin, in LAB_CATEGORIES order and each category's
 * preferred reading order. Name variants that resolve to another key of the
 * same panel (I-PTH → IPTH) are folded into that key's search aliases rather
 * than listed twice.
 */
export function getPinnableLabCatalog(): PinnableLab[] {
  if (cachedCatalog) return cachedCatalog
  const out: PinnableLab[] = []
  const seen = new Set<string>()
  for (const category of LAB_CATEGORIES) {
    const keys: string[] = []
    const push = (key: string) => {
      if (!keys.includes(key)) keys.push(key)
    }
    // preferredOrder / pinnedColumns hold canonical pivot keys only; subgroup
    // member lists may also carry spelling variants.
    const primary = new Set([...(category.preferredOrder ?? []), ...(category.pinnedColumns ?? [])])
    for (const key of category.preferredOrder ?? []) push(key)
    for (const key of category.pinnedColumns ?? []) push(key)
    for (const group of category.subgroups ?? []) for (const key of group.members) push(key)

    const keySet = new Set(keys)
    const aliasesByKey = new Map<string, string[]>()
    for (const code of category.codes) {
      const canonical = canonicalOf(code)
      const target = canonical && keySet.has(canonical) ? canonical : keySet.has(code) ? code : null
      if (!target) continue
      const list = aliasesByKey.get(target) ?? []
      list.push(code)
      aliasesByKey.set(target, list)
    }

    for (const key of keys) {
      const canonical = canonicalOf(key)
      // A spelling variant of another key in this same panel is not a
      // separate analyte. A pivot key never folds — the eGFR formulas and
      // calculated LDL are distinct columns even where their text alias
      // resolves to a sibling key.
      if (!primary.has(key) && !CANONICAL_KEYS.has(key) && canonical && canonical !== key && keySet.has(canonical)) continue
      const id = pinnedLabId(category.id, key)
      if (seen.has(id) || NEVER_POPULATED.has(id)) continue
      seen.add(id)
      const short = shortLabel(key)
      const nameZh = CANONICAL_TO_LAY_ZH[key]
      const nameEn = CANONICAL_TO_LAY_EN[key]
      const haystack = [key, short, nameZh, nameEn, ...(aliasesByKey.get(key) ?? [])]
        .filter((part): part is string => typeof part === 'string' && part.length > 0)
        .join(' ')
        .normalize('NFKC')
        .toLowerCase()
      out.push({ id, categoryId: category.id, testKey: key, short, nameZh, nameEn, haystack })
    }
  }
  cachedCatalog = out
  return out
}

export function findPinnableLab(id: string): PinnableLab | undefined {
  return getPinnableLabCatalog().find((entry) => entry.id === id)
}

function squash(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s\-_.()（）/]+/g, '')
}

/** Catalog entries matching every whitespace-separated term of the query.
 *  Punctuation and spacing are ignored ("nt pro bnp" finds NT-proBNP). */
export function searchPinnableLabs(query: string, catalog = getPinnableLabCatalog()): PinnableLab[] {
  const terms = query.trim().split(/\s+/).map(squash).filter(Boolean)
  if (!terms.length) return []
  const joined = squash(query)
  return catalog.filter((entry) => {
    const hay = squash(entry.haystack)
    return hay.includes(joined) || terms.every((term) => hay.includes(term))
  })
}

// ---------------------------------------------------------------------------
// Resolving one pinned analyte for the current patient
// ---------------------------------------------------------------------------

const INVALID_STATUSES = new Set(['entered-in-error', 'cancelled'])

export interface PinnedLabPoint {
  /** Collection day, "YYYY-MM-DD". */
  date: string
  cell: LabCell
  /** The value printed for this day: the FIRST source record. When the day
   *  holds several, `sameDayCount` says so and `cell.allValues` has them all. */
  value: string
  sameDayCount: number
}

export interface ResolvedPinnedLab {
  id: string
  latest?: PinnedLabPoint
  previous?: PinnedLabPoint
  /** Every usable collection day, newest first — copy formats that pin a
   *  line to one day look the value up here. */
  points: PinnedLabPoint[]
}

function usableValue(cell: LabCell | undefined): string | null {
  if (!cell) return null
  if (cell.status && INVALID_STATUSES.has(cell.status)) return null
  const first = (cell.allValues?.[0] ?? cell.value ?? '').trim()
  if (!first || first === '—') return null
  // "<5" must never paste as "5". The comparator belongs to the cell's single
  // record; with several same-day records it is not known which one it was.
  const single = !cell.allValues || cell.allValues.length < 2
  return single && cell.comparator && !/^[<>≤≥]/.test(first) ? `${cell.comparator}${first}` : first
}

/**
 * Latest and previous result for one pin, from pivots built over ALL loaded
 * observations (not the overview's date window — a six-month-old NT-proBNP
 * is still the latest one, and it must show with its real date).
 */
export function resolvePinnedLab(pivots: Record<string, LabPivot>, id: string): ResolvedPinnedLab {
  const parsed = parsePinnedLabId(id)
  if (!parsed) return { id, points: [] }
  const pivot = pivots[parsed.categoryId]
  if (!pivot) return { id, points: [] }
  const byDay = new Map<string, PinnedLabPoint>()
  for (const row of pivot.rows) {
    if (row.testKey !== parsed.testKey) continue
    for (const [date, cell] of row.values) {
      const value = usableValue(cell)
      if (!value) continue
      const count = cell.allValues?.length ?? 1
      const existing = byDay.get(date)
      if (existing) {
        existing.sameDayCount += count
        continue
      }
      byDay.set(date, { date, cell, value, sameDayCount: count })
    }
  }
  const points = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date))
  return { id, latest: points[0], previous: points[1], points }
}
