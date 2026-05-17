// Build pivot data for cumulative lab report view.
// Groups observations by lab category, then pivots into test (row) × date (column).
import { useMemo } from 'react'
import { categorizeObservation, getTestDisplayName, compareTestsByPreferred, LAB_CATEGORIES, type LabCategory } from '@/src/shared/utils/lab-categories'
import { TEST_ALIASES, normalizeTestName, classifyGlucose, GLUCOSE_SUBTYPE_LABEL } from '@/src/shared/utils/lab-normalize'

export interface LabCell {
  value: string
  unit?: string
  interpretationCode?: string  // 'H'|'L'|'N'|'A'|'AA'|'HH'|'LL' (HL7)
  isAbnormal?: boolean
  effectiveDateTime?: string
}

export interface LabRow {
  mapKey: string              // unique pivot key (NHI_CODE:testKey or testKey)
  testKey: string             // canonical analyte name; may match across institutions
  displayName: string         // shown in left column
  unit?: string               // unit summary (most common across all dates)
  values: Map<string, LabCell>  // date "YYYY-MM-DD" → cell
  subgroupId?: string         // assigned subgroup id (renal/liver/etc.)
}

export interface LabPivot {
  category: LabCategory
  dates: string[]   // sorted desc (newest first)
  rows: LabRow[]
}

function dateKey(s?: string): string | null {
  return s ? s.slice(0, 10) : null
}

// Fallback reference ranges for common tests when FHIR data lacks referenceRange
// and the source system (e.g. VGH bridge) doesn't set interpretation codes.
// Values are typical adult ranges — verify against your lab's report header.
const HARDCODED_REF_RANGES: Record<string, { low?: number; high?: number }> = {
  // Thyroid
  TSH:        { low: 0.35, high: 4.94 },   // uIU/mL
  'FREE T4':  { low: 0.70, high: 1.48 },   // ng/dL
  'FREE T3':  { low: 2.0,  high: 4.4  },   // pg/mL
  T4:         { low: 4.5,  high: 12.5 },   // ug/dL
  T3:         { low: 80,   high: 200  },   // ng/dL
  // Adrenal
  CORTISOL:   { low: 6.2,  high: 19.4 },   // ug/dL (AM)
  // Lipid
  TG:         {             high: 150  },   // mg/dL
  CHOL:       {             high: 200  },   // mg/dL
  LDL:        {             high: 130  },   // mg/dL
  HDL:        { low: 40               },   // mg/dL (conservative; male floor)
  // Glucose — fasting range applies only to AC (空腹) measurements.
  // Generic glucose (random/post-meal) and finger sugar are context-dependent.
  'GLUCOSE-AC': { low: 70, high: 100 },    // mg/dL (fasting)
  HBA1C:      {             high: 5.7 },   // %
}

function formatValue(obs: any): { value: string; unit?: string; numericValue?: number; isAbnormal: boolean; interpretationCode?: string; hasFhirRefRange: boolean } {
  let value = '—'
  let unit: string | undefined
  let numericValue: number | undefined
  if (obs.valueQuantity?.value !== undefined && obs.valueQuantity?.value !== null) {
    numericValue = obs.valueQuantity.value
    value = String(obs.valueQuantity.value)
    unit = obs.valueQuantity.unit || obs.valueQuantity.code
  } else if (obs.valueString) {
    value = obs.valueString
  } else if (obs.valueCodeableConcept?.text) {
    value = obs.valueCodeableConcept.text
  }
  const interp = obs.interpretation?.[0]?.coding?.[0]?.code || obs.interpretation?.coding?.[0]?.code
  let isAbnormal = !!interp && !['N', 'NORMAL'].includes(String(interp).toUpperCase())

  // Layer A: use FHIR referenceRange when interpretation code is absent.
  // Also tracks whether a usable numeric range was found — Layer B (hardcoded
  // fallback) must NOT run when FHIR already provided bounds, so that
  // institution-specific ranges (e.g. HbA1c [4.8-5.9] vs our 5.7) are respected.
  let hasFhirRefRange = false
  if (!isAbnormal && numericValue !== undefined) {
    const rr = obs.referenceRange?.[0]
    if (rr) {
      let lo = rr.low?.value, hi = rr.high?.value

      // Layer A.5: parse referenceRange.text for simple numeric formats when
      // structured low/high are absent (e.g. "0.35-4.94", "< 5.7", ">= 40").
      // Sex-stratified text like "[男:13.7 女:11.1]..." is intentionally skipped —
      // the bridge should provide structured low/high based on patient sex.
      if (lo === undefined && hi === undefined && rr.text) {
        const t = rr.text.trim()
        // Range: "11.1 - 17.0" or "11.1~17.0"
        const rangeM = t.match(/^([\d.]+)\s*[-~–]\s*([\d.]+)$/)
        if (rangeM) {
          lo = parseFloat(rangeM[1])
          hi = parseFloat(rangeM[2])
        } else {
          // Upper-only: "< 5.7" or "<= 5.7"
          const hiM = t.match(/^<[=]?\s*([\d.]+)$/)
          if (hiM) hi = parseFloat(hiM[1])
          // Lower-only: "> 40" or ">= 40"
          const loM = t.match(/^>[=]?\s*([\d.]+)$/)
          if (loM) lo = parseFloat(loM[1])
        }
      }

      if (lo !== undefined || hi !== undefined) {
        hasFhirRefRange = true
        if (lo !== undefined && numericValue < lo) isAbnormal = true
        if (hi !== undefined && numericValue > hi) isAbnormal = true
      }
    }
  }

  return { value, unit, numericValue, isAbnormal, interpretationCode: interp, hasFhirRefRange }
}

// NHI system URI used by the 健康存摺 bridge
const NHI_LAB_SYSTEM = 'urn:oid:nhi.lab.code'

// testKeys where different NHI codes represent clinically distinct analytes that
// must remain as separate pivot columns. All other tests merge by testKey so
// cross-institution same-analyte rows collapse into one column.
// Glucose was here but is now subclassified by display+LOINC (see
// classifyGlucose in lab-normalize.ts), which is more reliable than NHI code
// because some hospitals bill finger sugar under fasting NHI codes.
const KEEP_SEPARATE_BY_NHI = new Set<string>([])

// Returns the canonical analyte name (alias-resolved display key).
// Used for subgroup lookup, HARDCODED_REF_RANGES, and pinned-column matching.
function canonicalTestKey(obs: any): string {
  const raw = getTestDisplayName(obs)
  if (!raw) return 'UNKNOWN'
  const { stripped, collapsed } = normalizeTestName(raw)
  if (TEST_ALIASES[stripped]) return TEST_ALIASES[stripped]
  if (TEST_ALIASES[collapsed]) return TEST_ALIASES[collapsed]
  return stripped || collapsed || raw.toUpperCase()
}

// Returns { mapKey, testKey, displayName } for one observation.
//
// mapKey      – pivot row key; equals testKey for most tests so same-analyte
//               records from different institutions collapse into one column.
//               Uses "NHI_CODE:testKey" only for tests in KEEP_SEPARATE_BY_NHI
//               where the code distinguishes genuinely different analytes.
// testKey     – canonical analyte name; stable across data sources.
// displayName – label shown in the table; prefers NHI official display name.
// Known glucose-category testKeys that should NOT fall back to GLUCOSE generic.
// Everything else in the glucose category (typos, unfamiliar names) is treated
// as glucose and goes through subclassification, since the LOINC-based
// categorization already told us it's a glucose measurement.
const KNOWN_GLUCOSE_KEYS = new Set(['GLUCOSE', 'HBA1C', 'C-PEPTIDE', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC'])

function buildTestEntry(obs: any, categoryId?: string): { mapKey: string; testKey: string; displayName: string } {
  const raw = getTestDisplayName(obs)
  if (!raw) return { mapKey: 'UNKNOWN', testKey: 'UNKNOWN', displayName: 'UNKNOWN' }

  let testKey = canonicalTestKey(obs)
  let displayOverride: string | undefined

  if (categoryId === 'glucose') {
    // Safety net for HbA1c mislabeled as glucose: unit "%" or "mmol/mol"
    // (the two standard HbA1c units) reclassifies the row as HBA1C.
    const unit = String(obs?.valueQuantity?.unit ?? '').trim().toLowerCase()
    const isHbA1cUnit = unit === '%' || unit === 'percent' || unit === 'mmol/mol'

    if (isHbA1cUnit) {
      testKey = 'HBA1C'
      displayOverride = 'HbA1c'
    } else if (!KNOWN_GLUCOSE_KEYS.has(testKey)) {
      // Unknown glucose-category name (typos, unfamiliar variants) → fallback
      // to GLUCOSE; subclassification below will route to finger / fasting /
      // generic based on display + LOINC.
      testKey = 'GLUCOSE'
    }
  }

  // Glucose subclassification: split into fasting / finger-stick / generic
  // columns using display + LOINC (see classifyGlucose).
  if (testKey === 'GLUCOSE') {
    const sub = classifyGlucose(obs)
    const label = GLUCOSE_SUBTYPE_LABEL[sub]
    testKey = label.key
    displayOverride = label.display
  }

  const nhiCoding = obs.code?.coding?.find((c: any) => c.system === NHI_LAB_SYSTEM)
  const nhiCode = nhiCoding?.code as string | undefined
  const mapKey = (nhiCode && KEEP_SEPARATE_BY_NHI.has(testKey)) ? `${nhiCode}:${testKey}` : testKey

  // Column header preference:
  //   1. displayOverride (e.g. glucose subtypes) wins.
  //   2. If the display name maps to a known canonical (alias OR self-key,
  //      including verbose NHI forms like "Hct(血球容積比)"), use the clean
  //      canonical testKey for a compact, consistent header.
  //   3. Otherwise fall back to the bridge's NHI display or stripped raw label
  //      so unknown tests keep whatever the source institution sent.
  const nhiDisplay = nhiCoding?.display as string | undefined
  const rawDisplay = raw.replace(/\s*[\(\[].*$/, '').replace(/^Serum\s+/i, '').trim() || raw
  const candidateDisplay = nhiDisplay || rawDisplay
  const { stripped: candidateStripped, collapsed: candidateCollapsed } = normalizeTestName(candidateDisplay)
  const isKnown = !!(TEST_ALIASES[candidateStripped] || TEST_ALIASES[candidateCollapsed])
  const displayName = displayOverride || (isKnown ? testKey : candidateDisplay)

  return { mapKey, testKey, displayName }
}

export function useLabPivot(observations: any[]): Record<string, LabPivot> {
  return useMemo(() => {
    const result: Record<string, LabPivot> = {}

    // Initialize each category container
    for (const cat of LAB_CATEGORIES) {
      result[cat.id] = { category: cat, dates: [], rows: [] }
    }

    // Group observations by category
    const buckets: Record<string, any[]> = {}
    for (const cat of LAB_CATEGORIES) buckets[cat.id] = []

    for (const obs of observations) {
      const cat = categorizeObservation(obs)
      if (!cat) continue
      buckets[cat.id].push(obs)
    }

    // For each category, build the pivot. Don't early-return on empty obsList —
    // categories with pinnedColumns should still surface their standard headers
    // even when the patient has no data for any test in that category.
    for (const cat of LAB_CATEGORIES) {
      const obsList = buckets[cat.id]

      const dateSet = new Set<string>()
      const testMap = new Map<string, LabRow>()
      const unitCount = new Map<string, Map<string, number>>()

      for (const obs of obsList) {
        const date = dateKey(obs.effectiveDateTime)
        if (!date) continue
        dateSet.add(date)

        const { mapKey, testKey, displayName } = buildTestEntry(obs, cat.id)
        const fv = formatValue(obs)
        let { value, unit, numericValue, isAbnormal, interpretationCode, hasFhirRefRange } = fv

        // Layer B: hardcoded reference ranges — only when FHIR provided no usable
        // numeric range (hasFhirRefRange=false). Skipped when FHIR has bounds so
        // institution-specific ranges are respected over our generic fallback.
        if (!isAbnormal && !hasFhirRefRange && numericValue !== undefined) {
          const range = HARDCODED_REF_RANGES[testKey]
          if (range) {
            if (range.low !== undefined && numericValue < range.low) isAbnormal = true
            if (range.high !== undefined && numericValue > range.high) isAbnormal = true
          }
        }

        if (!testMap.has(mapKey)) {
          testMap.set(mapKey, { mapKey, testKey, displayName, values: new Map() })
          unitCount.set(mapKey, new Map())
        } else {
          // Prefer the shorter display name (cleaner labels)
          const row = testMap.get(mapKey)!
          if (displayName.length < row.displayName.length) {
            row.displayName = displayName
          }
        }
        const row = testMap.get(mapKey)!
        const cell: LabCell = {
          value,
          unit,
          isAbnormal,
          interpretationCode,
          effectiveDateTime: obs.effectiveDateTime,
        }
        // If multiple observations on same day, keep the last one (could be revised result)
        row.values.set(date, cell)
        if (unit) {
          const ucMap = unitCount.get(mapKey)!
          ucMap.set(unit, (ucMap.get(unit) || 0) + 1)
        }
      }

      // Pick most common unit per row
      for (const [mk, ucMap] of unitCount.entries()) {
        let bestUnit: string | undefined
        let bestCount = 0
        for (const [u, c] of ucMap.entries()) {
          if (c > bestCount) {
            bestCount = c
            bestUnit = u
          }
        }
        const row = testMap.get(mk)
        if (row) row.unit = bestUnit
      }

      // Inject stub rows for pinned columns not present in patient data.
      // Must check by testKey (not mapKey) since mapKey may include NHI prefix.
      if (cat.pinnedColumns) {
        const existingTestKeys = new Set([...testMap.values()].map(r => r.testKey))
        for (const pinKey of cat.pinnedColumns) {
          if (!existingTestKeys.has(pinKey)) {
            testMap.set(pinKey, { mapKey: pinKey, testKey: pinKey, displayName: pinKey, values: new Map() })
          }
        }
      }

      // Assign subgroupId to each row (matches against category.subgroups[].members)
      if (cat.subgroups) {
        const memberToGroup = new Map<string, string>()
        for (const sg of cat.subgroups) {
          for (const m of sg.members) {
            memberToGroup.set(m.toUpperCase(), sg.id)
          }
        }
        for (const row of testMap.values()) {
          row.subgroupId = memberToGroup.get(row.testKey)
        }
      }

      const dates = [...dateSet].sort((a, b) => b.localeCompare(a))  // newest first
      const cmp = compareTestsByPreferred(cat)

      // Sort by subgroup index first, then by preferredOrder within subgroup
      const sgOrder = new Map<string, number>()
      cat.subgroups?.forEach((sg, i) => sgOrder.set(sg.id, i))
      const rows = [...testMap.values()].sort((a, b) => {
        const ai = a.subgroupId ? sgOrder.get(a.subgroupId) ?? 999 : 999
        const bi = b.subgroupId ? sgOrder.get(b.subgroupId) ?? 999 : 999
        if (ai !== bi) return ai - bi
        return cmp(a.testKey, b.testKey)
      })

      result[cat.id] = { category: cat, dates, rows }
    }

    return result
  }, [observations])
}
