// Shared client-side filter helpers for FHIR query tools.
// Both live (`fhir-tools.ts`) and local-bundle (`local-fhir-tools.ts`)
// tools must apply identical filtering so the LLM sees consistent
// behaviour regardless of data source.

import { isObservationAbnormal } from '@/src/shared/utils/interpretation-helpers'

export function isWithinDateRange(
  date: string | undefined,
  dateFrom?: string,
  dateTo?: string,
): boolean {
  if (!date) return false
  if (dateFrom && date < dateFrom) return false
  if (dateTo && date > dateTo + 'T23:59:59') return false
  return true
}

// Normalize category-like codes for tolerant matching. LLMs commonly pass
// "Laboratory" / "lab" / "VITAL SIGNS" but data uses "laboratory" / "vital-signs".
function normalizeCategoryCode(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[\s-]+/g, '')
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  lab: ['laboratory'],
  laboratory: ['lab'],
  vitalsigns: ['vital', 'vitals'],
  vital: ['vitalsigns', 'vitals'],
  vitals: ['vitalsigns', 'vital'],
  imaging: ['radiology', 'rad'],
  radiology: ['imaging', 'rad'],
  rad: ['imaging', 'radiology'],
}

export function matchCategoryCoding(categories: any, target: string | undefined): boolean {
  if (!target) return true
  if (!Array.isArray(categories)) return false
  const t = normalizeCategoryCode(target)
  const acceptable = new Set<string>([t, ...(CATEGORY_ALIASES[t] ?? [])])
  return categories.some((c: any) =>
    Array.isArray(c?.coding) &&
    c.coding.some((cc: any) => acceptable.has(normalizeCategoryCode(cc?.code)))
  )
}

export function matchClinicalStatus(clinicalStatus: any, target: string | undefined): boolean {
  if (!target) return true
  const code =
    typeof clinicalStatus === 'string'
      ? clinicalStatus
      : clinicalStatus?.coding?.[0]?.code || clinicalStatus?.text
  return String(code || '').toLowerCase() === target.toLowerCase()
}

export function matchStatus(status: string | undefined, target: string | undefined): boolean {
  if (!target) return true
  return String(status || '').toLowerCase() === target.toLowerCase()
}

export function isChronicByCourseOfTherapy(courseOfTherapyType: any): boolean {
  const coding = courseOfTherapyType?.coding
  if (!Array.isArray(coding)) return false
  return coding.some((c: any) => c?.code === 'continuous')
}

export function matchChronic(courseOfTherapyType: any, chronic: boolean | undefined): boolean {
  if (chronic === undefined) return true
  const isChronic = isChronicByCourseOfTherapy(courseOfTherapyType)
  return chronic ? isChronic : !isChronic
}

// HL7 v3 ActCode short codes ↔ human-readable aliases. NHI bridge uses
// `IMP` / `AMB` / `EMER` etc. but LLMs naturally guess `inpatient` /
// `outpatient`. Accept either side.
const ENCOUNTER_CLASS_ALIASES: Record<string, Set<string>> = {
  inpatient: new Set(['imp', 'inpatient', 'acute', 'ss', 'obsenc', 'prenc']),
  outpatient: new Set(['amb', 'ambulatory', 'outpatient', 'op']),
  emergency: new Set(['emer', 'emergency', 'ed']),
  home: new Set(['hh', 'home']),
  virtual: new Set(['vr', 'virtual', 'tele']),
  pharmacy: new Set(['pharm', 'pharmacy']),
}

export function matchEncounterClass(encounterClass: any, target: string | undefined): boolean {
  if (!target) return true
  const codes = [
    encounterClass?.code,
    encounterClass?.coding?.[0]?.code,
  ].filter(Boolean).map((c) => String(c).toLowerCase())
  const targetLower = target.toLowerCase()
  if (codes.includes(targetLower)) return true
  // Friendly target → check HL7 aliases (e.g. "inpatient" → IMP)
  const friendlySet = ENCOUNTER_CLASS_ALIASES[targetLower]
  if (friendlySet && codes.some((c) => friendlySet.has(c))) return true
  // HL7 target → check if friendly group contains this code (e.g. "IMP" → matches inpatient encounters)
  for (const codeSet of Object.values(ENCOUNTER_CLASS_ALIASES)) {
    if (codeSet.has(targetLower) && codes.some((c) => codeSet.has(c))) return true
  }
  return false
}

export function matchDiagnosticReportCategory(category: any, target: string | undefined): boolean {
  // Same alias logic as matchCategoryCoding so "imaging" matches "RAD",
  // "lab" matches "LAB", etc.
  return matchCategoryCoding(category, target)
}

export function matchAllergyType(type: string | undefined, target: string | undefined): boolean {
  if (!target) return true
  return String(type || '').toLowerCase() === target.toLowerCase()
}

/**
 * Abnormal observation detector for AI tool output. Delegates to the app's
 * single source of truth (`isObservationAbnormal`) so the LLM sees exactly
 * the same verdict as the left-panel display: source interpretation is
 * authoritative when present (Normal/Negative → NOT abnormal, no range math),
 * and only when interpretation is absent does the audited referenceRange
 * fallback run (rejects low>high and dirty repeated-bracket text ranges).
 */
export function isAbnormalObservation(obs: any): boolean {
  return isObservationAbnormal(obs)
}

export function matchSubstring(haystack: string | undefined, needle: string | undefined): boolean {
  if (!needle) return true
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

const CRITICALITY_BY_SEVERITY: Record<string, string[]> = {
  high: ['high'],
  moderate: ['moderate'],
  low: ['low'],
}

export function matchAllergySeverity(criticality: string | undefined, target: string | undefined): boolean {
  if (!target) return true
  const allowed = CRITICALITY_BY_SEVERITY[target.toLowerCase()] ?? []
  return allowed.includes(String(criticality || '').toLowerCase())
}

export function applyLimit<T>(items: T[], limit: number | undefined, fallback = 50): T[] {
  const cap = limit && limit > 0 ? limit : fallback
  return items.slice(0, cap)
}
