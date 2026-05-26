// Shared client-side filter helpers for FHIR query tools.
// Both live (`fhir-tools.ts`) and local-bundle (`local-fhir-tools.ts`)
// tools must apply identical filtering so the LLM sees consistent
// behaviour regardless of data source.

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

const ABNORMAL_CODES = new Set([
  'H', 'HI', 'HIGH', 'HH', 'CRIT-HI',
  'L', 'LO', 'LOW', 'LL', 'CRIT-LO',
  'A', 'ABN', 'ABNORMAL',
  'POS', 'POSITIVE', 'DETECTED', 'REACTIVE',
])

function getInterpretationCode(concept: any): string {
  const raw = concept?.coding?.[0]?.code || concept?.coding?.[0]?.display || concept?.text || ''
  return String(raw).toUpperCase().trim()
}

/**
 * Abnormal observation detector — matches `interpretation` code (H/L/A/POS
 * and crit variants) OR falls back to FHIR `referenceRange` low/high check
 * when no interpretation is set. Mirrors the left-panel report highlight.
 */
export function isAbnormalObservation(obs: any): boolean {
  const interpretation = obs?.interpretation
  if (interpretation) {
    const arr = Array.isArray(interpretation) ? interpretation : [interpretation]
    for (const i of arr) {
      const code = getInterpretationCode(i)
      if (ABNORMAL_CODES.has(code)) return true
    }
  }

  // referenceRange fallback for numeric values
  const numVal = obs?.valueQuantity?.value
  if (numVal === undefined || numVal === null) return false
  const rr = obs?.referenceRange?.[0]
  if (!rr) return false

  let lo: number | undefined = rr.low?.value
  let hi: number | undefined = rr.high?.value

  if (lo === undefined && hi === undefined && rr.text) {
    const t = String(rr.text).trim()
    const bracketM = t.match(/^\[([^\]]*)\]\[([^\]]*)\]$/)
    if (bracketM) {
      const [, loStr, hiStr] = bracketM
      if (loStr) { const n = parseFloat(loStr); if (!isNaN(n)) lo = n }
      if (hiStr) { const n = parseFloat(hiStr); if (!isNaN(n)) hi = n }
    } else {
      const rangeM = t.match(/^([\d.]+)\s*[-~–]\s*([\d.]+)$/)
      if (rangeM) {
        lo = parseFloat(rangeM[1])
        hi = parseFloat(rangeM[2])
      }
    }
  }

  if (lo !== undefined && numVal < lo) return true
  if (hi !== undefined && numVal > hi) return true
  return false
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
