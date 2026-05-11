// Build pivot data for cumulative lab report view.
// Groups observations by lab category, then pivots into test (row) × date (column).
import { useMemo } from 'react'
import { categorizeObservation, getTestDisplayName, compareTestsByPreferred, LAB_CATEGORIES, type LabCategory } from '@/src/shared/utils/lab-categories'

export interface LabCell {
  value: string
  unit?: string
  interpretationCode?: string  // 'H'|'L'|'N'|'A'|'AA'|'HH'|'LL' (HL7)
  isAbnormal?: boolean
  effectiveDateTime?: string
}

export interface LabRow {
  testKey: string             // normalized identifier (used as map key)
  displayName: string         // shown in left column
  unit?: string               // unit summary (most common across all dates)
  values: Map<string, LabCell>  // date "YYYY-MM-DD" → cell
}

export interface LabPivot {
  category: LabCategory
  dates: string[]   // sorted desc (newest first)
  rows: LabRow[]
}

function dateKey(s?: string): string | null {
  return s ? s.slice(0, 10) : null
}

function formatValue(obs: any): { value: string; unit?: string; isAbnormal: boolean; interpretationCode?: string } {
  let value = '—'
  let unit: string | undefined
  if (obs.valueQuantity?.value !== undefined && obs.valueQuantity?.value !== null) {
    value = String(obs.valueQuantity.value)
    unit = obs.valueQuantity.unit || obs.valueQuantity.code
  } else if (obs.valueString) {
    value = obs.valueString
  } else if (obs.valueCodeableConcept?.text) {
    value = obs.valueCodeableConcept.text
  }
  const interp = obs.interpretation?.[0]?.coding?.[0]?.code || obs.interpretation?.coding?.[0]?.code
  const isAbnormal = !!interp && !['N', 'NORMAL'].includes(String(interp).toUpperCase())
  return { value, unit, isAbnormal, interpretationCode: interp }
}

// Map of common test aliases → canonical name. Add entries when source
// data uses inconsistent names for the same analyte (e.g. "ALT" / "ALT(GPT)" /
// "ALT/GPT" / "GPT" should all merge into one row).
const TEST_ALIASES: Record<string, string> = {
  // Creatinine
  CREATININE: 'CREATININE', CREAT: 'CREATININE', 'CREAT.': 'CREATININE', CREA: 'CREATININE',
  // Hemoglobin / Hematocrit
  HB: 'HB', HGB: 'HB', HEMOGLOBIN: 'HB',
  HCT: 'HCT', HEMATOCRIT: 'HCT',
  // Electrolytes
  NA: 'NA', SODIUM: 'NA',
  K: 'K', POTASSIUM: 'K',
  CL: 'CL', CHLORIDE: 'CL',
  CA: 'CA', CALCIUM: 'CA', CACAL: 'CA',
  IP: 'IP', PHOSPHATE: 'IP', PHOSPHORUS: 'IP',
  // Glucose
  GLU: 'GLUCOSE', GLUCOSE: 'GLUCOSE',
  // Lipids
  CHOL: 'CHOL', 'CHOL.': 'CHOL', CHOLESTEROL: 'CHOL',
  TG: 'TG', TRIG: 'TG', TRIGLYCERIDE: 'TG', TRIGLYCERIDES: 'TG',
  HDL: 'HDLC', 'HDL-C': 'HDLC', HDLC: 'HDLC',
  LDL: 'LDLC', 'LDL-C': 'LDLC', LDLC: 'LDLC',
  // Liver enzymes (with GOT/GPT legacy aliases)
  ALT: 'ALT', GPT: 'ALT', 'ALT/GPT': 'ALT', 'GPT/ALT': 'ALT', 'GPT(ALT)': 'ALT',
  AST: 'AST', GOT: 'AST', 'AST/GOT': 'AST', 'GOT/AST': 'AST', 'GOT(AST)': 'AST',
  GGT: 'GGT', 'G-GT': 'GGT', 'GAMMA GT': 'GGT', 'GAMMA-GT': 'GGT',
  'ALK-P': 'ALK-P', ALKP: 'ALK-P', 'ALKALINE PHOSPHATASE': 'ALK-P',
  LDH: 'LDH', 'LACTATE DEHYDROGENASE': 'LDH',
  // Bilirubin
  'T.BILI': 'T.BILI', 'T.BILI.': 'T.BILI', TBILI: 'T.BILI', BILIT: 'T.BILI', 'TOTAL BILIRUBIN': 'T.BILI', BILIRUBIN: 'T.BILI',
  'D.BILI': 'D.BILI', DBILI: 'D.BILI', 'DIRECT BILIRUBIN': 'D.BILI',
  // Protein
  TP: 'TP', 'TOTAL PROTEIN': 'TP',
  ALB: 'ALB', ALBUMIN: 'ALB',
  // BUN
  BUN: 'BUN', 'UREA NITROGEN': 'BUN', UREA: 'BUN',
  // Uric acid
  UA: 'URIC ACID', URATE: 'URIC ACID', 'URIC ACID': 'URIC ACID',
  // CRP
  CRP: 'CRP', 'C REACTIVE PROTEIN': 'CRP', 'C-REACTIVE PROTEIN': 'CRP', 'HS-CRP': 'CRP',
  // Cardiac
  CK: 'CK', 'CREATINE KINASE': 'CK',
  CKMB: 'CKMB', 'CK-MB': 'CKMB',
  TROP: 'TROP', TROPONIN: 'TROP', 'TROPONIN I': 'TROP', 'TROPONIN T': 'TROP',
  // Iron
  IRON: 'IRON', FE: 'IRON',
  TIBC: 'TIBC',
  // Glycated hemoglobin
  HBA1C: 'HBA1C', 'HEMOGLOBIN A1C': 'HBA1C', 'GLYCATED HEMOGLOBIN': 'HBA1C', 'GLYCOHEMOGLOBIN': 'HBA1C',
}

function pickKey(obs: any): string {
  // Strip parenthesized/bracketed qualifiers so "Creatinine(B)",
  // "Creatinine(Blood)", "Creatinine [Mass/volume] in Serum or Plasma"
  // all collapse to "Creatinine".
  const raw = getTestDisplayName(obs).trim()
  const stripped = raw.replace(/\s*[\(\[].*$/, '').trim() || raw
  const norm = stripped.toUpperCase()
  return TEST_ALIASES[norm] || norm
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

    // For each category, build the pivot
    for (const cat of LAB_CATEGORIES) {
      const obsList = buckets[cat.id]
      if (obsList.length === 0) continue

      const dateSet = new Set<string>()
      const testMap = new Map<string, LabRow>()
      const unitCount = new Map<string, Map<string, number>>()

      for (const obs of obsList) {
        const date = dateKey(obs.effectiveDateTime)
        if (!date) continue
        dateSet.add(date)

        const key = pickKey(obs)
        // Strip parenthesized qualifiers from display too, so the row label
        // shows "Creatinine" not "Creatinine(B)".
        const raw = getTestDisplayName(obs)
        const displayName = raw.replace(/\s*[\(\[].*$/, '').trim() || raw
        const { value, unit, isAbnormal, interpretationCode } = formatValue(obs)

        if (!testMap.has(key)) {
          testMap.set(key, { testKey: key, displayName, values: new Map() })
          unitCount.set(key, new Map())
        } else {
          // Prefer the shorter display name (cleaner labels)
          const row = testMap.get(key)!
          if (displayName.length < row.displayName.length) {
            row.displayName = displayName
          }
        }
        const row = testMap.get(key)!
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
          const ucMap = unitCount.get(key)!
          ucMap.set(unit, (ucMap.get(unit) || 0) + 1)
        }
      }

      // Pick most common unit per row
      for (const [key, ucMap] of unitCount.entries()) {
        let bestUnit: string | undefined
        let bestCount = 0
        for (const [u, c] of ucMap.entries()) {
          if (c > bestCount) {
            bestCount = c
            bestUnit = u
          }
        }
        const row = testMap.get(key)
        if (row) row.unit = bestUnit
      }

      const dates = [...dateSet].sort((a, b) => b.localeCompare(a))  // newest first
      const cmp = compareTestsByPreferred(cat)
      const rows = [...testMap.values()].sort((a, b) => cmp(a.testKey, b.testKey))

      result[cat.id] = { category: cat, dates, rows }
    }

    return result
  }, [observations])
}
