// Lab pivot builder — pure data transform (no React). Moved from
// features/clinical-summary/reports/hooks/useLabPivot.ts so core (AI-context
// lab section) can reuse it without a core→features dependency; the hook file
// re-exports everything for existing feature/test imports.
// Groups observations by lab category, then pivots into test (row) × date (column).
// Groups observations by lab category, then pivots into test (row) × date (column).
import { categorizeObservation, getTestDisplayName, compareTestsByPreferred, LAB_CATEGORIES, type LabCategory } from '@/src/shared/utils/lab-categories'
import { CANONICAL_KEYS, CANONICAL_DISPLAY, classifyGlucose, GLUCOSE_SUBTYPE_LABEL, canonicalKeyFromLoinc, canonicalTestKeyFromString } from '@/src/shared/utils/lab-normalize'
import { normalizeAnalyteUnit } from '@/src/shared/utils/unit-scale'
import { isObservationAbnormal } from '@/src/shared/utils/interpretation-helpers'

export interface LabCell {
  value: string
  /** Every source value when multiple records share one analyte/day cell. */
  allValues?: string[]
  unit?: string
  interpretationCode?: string  // 'H'|'L'|'N'|'A'|'AA'|'HH'|'LL' (HL7)
  isAbnormal?: boolean
  effectiveDateTime?: string
  status?: string
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

// A pivot cell is "numeric" when its value parses as a finite number (the unit
// lives in a separate field). Qualitative serology results (Reactive / Positive
// / Negative / Trace …) are non-numeric. Drives the qualitative+quantitative
// same-day merge in the cell-write loop.
function isNumericCellValue(v: string | undefined): boolean {
  if (!v) return false
  const t = v.trim()
  if (t === '' || t === '—') return false
  return Number.isFinite(Number(t))
}

// NOTE (2026-07-10): the app-side HARDCODED_REF_RANGES table (TSH / lipids /
// HbA1c / glucose-AC …) was REMOVED per user directive. Abnormal flagging now
// derives from the source's Observation.interpretation when present, falling
// back only to audited source reference ranges (structured low/high or simple
// text like "0~41" / "<5"; see src/shared/utils/interpretation-helpers.ts).
// The app still does not invent its own normal ranges.

// Exported for unit-test access; the cumulative-report cell colouring
// depends on its isAbnormal output, so we lock it down separately from
// the React hook.
export function formatValue(obs: any): { value: string; unit?: string; numericValue?: number; isAbnormal: boolean; interpretationCode?: string; status?: string } {
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
  // Observation.interpretation is FHIR 0..* (array); tolerate the single-concept
  // shape too. This is the SOURCE's own verdict and is authoritative.
  const interp = obs.interpretation?.[0]?.coding?.[0]?.code || obs.interpretation?.coding?.[0]?.code
  // Shared abnormal policy: source interpretation wins; if absent, audited
  // source reference ranges may flag the value.
  const isAbnormal = isObservationAbnormal(obs)

  return { value, unit, numericValue, isAbnormal, interpretationCode: interp, status: typeof obs.status === 'string' ? obs.status.toLowerCase() : undefined }
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
  // 1. LOINC is the authoritative analyte identifier. Trust whatever the
  //    bridge attaches — if it's wrong, the fix belongs at the bridge layer,
  //    not in app-side display-string heuristics.
  const fromLoinc = canonicalKeyFromLoinc(obs)
  if (fromLoinc) return fromLoinc

  // 2. Fall back to display-name alias when no recognized LOINC is present
  //    (some institutions / orphan obs ship without coding entries).
  //    Delegate to canonicalTestKeyFromString — the single source of truth for
  //    text→key alias resolution. (This block used to inline a verbatim copy
  //    of that function's body; the duplication has been removed so the two
  //    pathways can never drift.)
  const raw = getTestDisplayName(obs)
  if (!raw) return 'UNKNOWN'
  return canonicalTestKeyFromString(raw)
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
    // (Previously: unit-based HbA1c reclassification removed 2026-05-29.)
    // Bridge sometimes mis-categorises HbA1c rows into the glucose family.
    // We used to silently reroute by sniffing the unit (% / mmol/mol);
    // that hid the bridge categorisation bug. Now we let the row stay
    // where bridge put it — clinicians will see "5.7%" next to glucose
    // values and recognise the mis-categorisation. See memory/
    // feedback_no_masking_bridge_bugs.md.
    if (!KNOWN_GLUCOSE_KEYS.has(testKey)) {
      // Unknown glucose-category name (typos, unfamiliar variants) → fallback
      // to GLUCOSE; subclassification below will route to finger / fasting /
      // generic based on display + LOINC. This is UI taxonomy, not bridge
      // data alteration, so it stays.
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
  //   2. If testKey is itself a canonical short code (any value the alias
  //      maps or LOINC map can emit), use it directly — possibly via the
  //      CANONICAL_DISPLAY override (e.g. APTT-RATIO → "APTT-ratio"). This
  //      is preferred over the bridge's NHI display because NHI often
  //      sends the PANEL name (e.g. "白血球分類計數" for a "嗜中性白血球"
  //      obs), which would produce confusing column headers in the
  //      cumulative report.
  //   3. Otherwise fall back to the bridge's NHI display or stripped raw
  //      label so unknown tests keep whatever the source institution sent.
  const nhiDisplay = nhiCoding?.display as string | undefined
  const rawDisplay = raw.replace(/\s*[\(\[].*$/, '').replace(/^Serum\s+/i, '').trim() || raw
  const candidateDisplay = nhiDisplay || rawDisplay
  const isCanonical = CANONICAL_KEYS.has(testKey)
  const canonicalDisplay = CANONICAL_DISPLAY[testKey] || testKey
  const displayName = displayOverride || (isCanonical ? canonicalDisplay : candidateDisplay)

  return { mapKey, testKey, displayName }
}

export function buildLabPivots(observations: any[]): Record<string, LabPivot> {
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
      const { value, unit, numericValue, interpretationCode, status } = fv
      const { isAbnormal } = fv

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

      // Cumulative-report-only unit normalisation: some analytes come through with
      // the same unit at different scales across hospitals (WBC "5 K/µL" vs raw
      // "5600 /µL"; CRP "0.5 mg/dL" vs "5 mg/L"), making a single column
      // unreadable. Rescale to one canonical unit here. `isAbnormal` was already
      // computed from the raw value vs the obs's own referenceRange above, so it
      // stays correct. The raw row-by-row report uses a different path, untouched.
      let cellValue = value
      let cellUnit = unit
      if (numericValue !== undefined) {
        const norm = normalizeAnalyteUnit(testKey, numericValue, unit)
        if (norm) {
          cellValue = String(norm.value)
          cellUnit = norm.unit
        }
      }

      const cell: LabCell = {
        value: cellValue,
        unit: cellUnit,
        isAbnormal,
        interpretationCode,
        effectiveDateTime: obs.effectiveDateTime,
        status,
      }
      // Same analyte, same day: default is last-write-wins (a revised result
      // supersedes the earlier one). EXCEPTION — a qualitative + quantitative
      // PAIR: e.g. Anti-HBc ships both a Presence result "Reactive"
      // (LOINC 13952-7) and a Units/volume COI number (22316-4), both resolving
      // to the same canonical ANTI-HBC column. Neither should clobber the other;
      // merge into one cell "Reactive (0.012)". Guarded narrowly to exactly
      // one-numeric-one-qualitative, so serial numerics (two glucose draws in a
      // day) still last-write-win rather than concatenating into garbage.
      const prev = row.values.get(date)
      const incomingNumeric = numericValue !== undefined
      if (prev?.allValues) {
        const allValues = [...prev.allValues, cell.value]
        row.values.set(date, {
          ...prev,
          value: allValues.join(' / '),
          allValues,
          isAbnormal: !!prev.isAbnormal || !!cell.isAbnormal,
          interpretationCode: prev.interpretationCode || cell.interpretationCode,
          status: prev.status === cell.status ? prev.status : [prev.status, cell.status].filter(Boolean).join('|') || undefined,
        })
      } else if (prev && incomingNumeric !== isNumericCellValue(prev.value)) {
        const qual = incomingNumeric ? prev : cell
        const quant = incomingNumeric ? cell : prev
        row.values.set(date, {
          value: `${qual.value} (${quant.value})`,
          isAbnormal: !!qual.isAbnormal || !!quant.isAbnormal,
          interpretationCode: qual.interpretationCode || quant.interpretationCode,
          effectiveDateTime: cell.effectiveDateTime || prev.effectiveDateTime,
          status: qual.status === quant.status ? qual.status : [qual.status, quant.status].filter(Boolean).join('|') || undefined,
        })
      } else if (prev) {
        // Never overwrite a same-analyte/same-day source record. A pivot cell is
        // one visual slot, so retain every value explicitly inside that slot.
        const allValues = [prev.value, cell.value]
        row.values.set(date, {
          ...cell,
          value: allValues.join(' / '),
          allValues,
          isAbnormal: !!prev.isAbnormal || !!cell.isAbnormal,
          interpretationCode: prev.interpretationCode || cell.interpretationCode,
          status: prev.status === cell.status ? prev.status : [prev.status, cell.status].filter(Boolean).join('|') || undefined,
        })
      } else {
        row.values.set(date, cell)
      }
      if (cellUnit) {
        const ucMap = unitCount.get(mapKey)!
        ucMap.set(cellUnit, (ucMap.get(cellUnit) || 0) + 1)
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
}
