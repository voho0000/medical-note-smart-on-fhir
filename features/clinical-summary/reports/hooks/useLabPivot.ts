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
//
// Both stripped and collapsed forms are looked up — so for "Hb-A1c" the
// lookups try "HB-A1C" first then "HBA1C". Add either form.
const TEST_ALIASES: Record<string, string> = {
  // Creatinine
  CREATININE: 'CREATININE', CREAT: 'CREATININE', 'CREAT.': 'CREATININE', CREA: 'CREATININE',
  // Hemoglobin / Hematocrit
  HB: 'HB', HGB: 'HB', HEMOGLOBIN: 'HB',
  HCT: 'HCT', HEMATOCRIT: 'HCT',
  // White blood cell
  WBC: 'WBC', 'WBC COUNT': 'WBC', 'WBC CCOUNT': 'WBC', LEUKOCYTE: 'WBC', LEUKOCYTES: 'WBC', 'WHITE BLOOD CELL': 'WBC', 'WHITE BLOOD CELLS': 'WBC',
  // Red blood cell
  RBC: 'RBC', 'RBC COUNT': 'RBC', ERYTHROCYTE: 'RBC', ERYTHROCYTES: 'RBC', 'RED BLOOD CELL': 'RBC', 'RED BLOOD CELLS': 'RBC',
  // Platelet
  PLT: 'PLT', PLATELET: 'PLT', PLATELETS: 'PLT', 'PLATELET COUNT': 'PLT', 'PLATELET CCOUNT': 'PLT',
  // Differential — segs/bands/neutrophils
  SEG: 'NEU', 'SEG.': 'NEU', NEU: 'NEU', 'NEU.': 'NEU', NEUTROPHIL: 'NEU', NEUTROPHILS: 'NEU', 'NEUTROPHIL SEGMENTED': 'NEU', 'NEUTROPHILIC SEGMENTED': 'NEU', 'NEUTROPHILIC SEG': 'NEU', 'NEUTROPHILIC SEGS': 'NEU', 'NEUTROPHILIC SEGMENT': 'NEU',
  LYM: 'LYM', 'LYM.': 'LYM', LYMPHOCYTE: 'LYM', LYMPHOCYTES: 'LYM',
  MONO: 'MONO', 'MONO.': 'MONO', MONOCYTE: 'MONO', MONOCYTES: 'MONO',
  EOS: 'EOS', 'EOS.': 'EOS', EOSINOPHIL: 'EOS', EOSINOPHILS: 'EOS',
  BASO: 'BASO', 'BASO.': 'BASO', BASOPHIL: 'BASO', BASOPHILS: 'BASO',
  BAND: 'BAND', BANDS: 'BAND', 'BAND CELL': 'BAND', 'BAND CELLS': 'BAND',
  ANC: 'ANC', 'ABSOLUTE NEUTROPHIL COUNT': 'ANC',
  // RBC indices
  MCV: 'MCV', MCH: 'MCH', MCHC: 'MCHC',
  RDW: 'RDW', 'RDW-CV': 'RDW', 'RDW.CV': 'RDW',
  MPV: 'MPV',
  // Coagulation
  PT: 'PT', 'PROTHROMBIN TIME': 'PT',
  APTT: 'APTT', 'PARTIAL THROMBOPLASTIN TIME': 'APTT', 'ACTIVATED PARTIAL THROMBOPLASTIN TIME': 'APTT',
  INR: 'INR',
  'D-DIMER': 'D-DIMER', DDIMER: 'D-DIMER', 'D DIMER': 'D-DIMER',
  FDP: 'FDP',
  FIBRINOGEN: 'FIBRINOGEN', FIB: 'FIBRINOGEN',
  // Electrolytes
  NA: 'NA', SODIUM: 'NA',
  K: 'K', POTASSIUM: 'K',
  CL: 'CL', CHLORIDE: 'CL',
  CA: 'CA', CALCIUM: 'CA', CACAL: 'CA',
  IP: 'IP', PHOSPHATE: 'IP', PHOSPHORUS: 'IP',
  // Glucose
  GLU: 'GLUCOSE', GLUCOSE: 'GLUCOSE',
  // Lipids
  CHOL: 'CHOL', 'CHOL.': 'CHOL', CHOLESTEROL: 'CHOL', 'TOTAL CHOLESTEROL': 'CHOL',
  TG: 'TG', TRIG: 'TG', TRIGLYCERIDE: 'TG', TRIGLYCERIDES: 'TG',
  HDL: 'HDL', 'HDL-C': 'HDL', HDLC: 'HDL', 'HDLC.': 'HDL', 'HDL CHOLESTEROL': 'HDL', 'CHOLESTEROL IN HDL': 'HDL', 'HIGH DENSITY LIPOPROTEIN': 'HDL',
  LDL: 'LDL', 'LDL-C': 'LDL', LDLC: 'LDL', 'LDLC.': 'LDL', 'LDL CHOLESTEROL': 'LDL', 'CHOLESTEROL IN LDL': 'LDL', 'LOW DENSITY LIPOPROTEIN': 'LDL',
  // Liver enzymes (with GOT/GPT/SGOT/SGPT legacy aliases)
  ALT: 'ALT', GPT: 'ALT', SGPT: 'ALT', 'ALT/GPT': 'ALT', 'GPT/ALT': 'ALT', 'GPT(ALT)': 'ALT', 'SGPT(ALT)': 'ALT',
  AST: 'AST', GOT: 'AST', SGOT: 'AST', 'AST/GOT': 'AST', 'GOT/AST': 'AST', 'GOT(AST)': 'AST', 'SGOT(AST)': 'AST',
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
  // Procalcitonin (bacterial infection marker, NOT a tumor marker)
  PCT: 'PCT', PROCALCITONIN: 'PCT',
  ESR: 'ESR', 'ERYTHROCYTE SEDIMENTATION RATE': 'ESR',
  LACTATE: 'LACTATE',
  // Cardiac
  CK: 'CK', 'CREATINE KINASE': 'CK',
  CKMB: 'CKMB', 'CK-MB': 'CKMB',
  TROP: 'TROP', TROPONIN: 'TROP', 'TROPONIN I': 'TROP', 'TROPONIN T': 'TROP',
  // Iron
  IRON: 'IRON', FE: 'IRON',
  TIBC: 'TIBC',
  // Tumor markers — variants
  PSA: 'PSA', TPSA: 'PSA', 'T-PSA': 'PSA', 'TOTAL PSA': 'PSA', 'PROSTATE SPECIFIC AG': 'PSA', 'PROSTATE-SPECIFIC AG': 'PSA', 'PROSTATE SPECIFIC ANTIGEN': 'PSA', 'PROSTATE-SPECIFIC ANTIGEN': 'PSA',
  FPSA: 'F-PSA', 'F-PSA': 'F-PSA', 'PSA-F': 'F-PSA', 'FREE PSA': 'F-PSA',
  CEA: 'CEA', 'CARCINOEMBRYONIC ANTIGEN': 'CEA',
  AFP: 'AFP', 'ALPHA FETOPROTEIN': 'AFP', 'ALPHA-FETOPROTEIN': 'AFP',
  'CA-125': 'CA-125', CA125: 'CA-125', 'CA 125': 'CA-125',
  'CA-153': 'CA-153', CA153: 'CA-153', 'CA 15-3': 'CA-153',
  'CA-199': 'CA-199', CA199: 'CA-199', 'CA19-9': 'CA-199', 'CA 19-9': 'CA-199',
  FERRITIN: 'FERRITIN',
  HCG: 'HCG', 'BETA HCG': 'HCG', 'BETA-HCG': 'HCG', 'B-HCG': 'HCG',
  // Glycated hemoglobin (Hb-A1c, HbA1c, Hemoglobin A1c all merge)
  HBA1C: 'HBA1C', 'HB-A1C': 'HBA1C', 'HB A1C': 'HBA1C',
  'HEMOGLOBIN A1C': 'HBA1C', 'HEMOGLOBINA1C': 'HBA1C',
  'GLYCATED HEMOGLOBIN': 'HBA1C', GLYCATEDHEMOGLOBIN: 'HBA1C',
  'GLYCOHEMOGLOBIN': 'HBA1C',

  // ── Glucose (fasting / AC / random / Glu-AC / Finger sugar all merge) ──
  'GLU-AC': 'GLUCOSE', GLUAC: 'GLUCOSE', 'GLUCOSE AC': 'GLUCOSE', GLUCOSEAC: 'GLUCOSE',
  'GLUCOSE(AC)': 'GLUCOSE', 'GLU(AC)': 'GLUCOSE',
  'FINGER SUGAR': 'GLUCOSE', FINGERSUGAR: 'GLUCOSE',
  'FASTING GLUCOSE': 'GLUCOSE',

  // ── Collapsed (no separators) lookups for pickKey's collapsed-form match ──
  // These handle "Hb-A1c" / "HbA1c" / "Hb A1c" → all become "HBA1C" after
  // collapsing, so this single entry catches them all.
  WBCCOUNT: 'WBC',
  RBCCOUNT: 'RBC',
  PLATELETCOUNT: 'PLT', PLATELETCCOUNT: 'PLT',
  HT: 'HCT', HTCT: 'HCT',
  NEUTROPHILSEGMENTED: 'NEU', NEUTROPHILICSEGMENTED: 'NEU',
  NEUTROPHILICSEG: 'NEU', NEUTROPHILICSE: 'NEU',
  SEGS: 'NEU', SEGMENT: 'NEU',
  EOSINOPHILCOUNT: 'EOS', EOSINOPHILCOUN: 'EOS',
  // Chem extras
  ALBUMINBCG: 'ALB',
  TOTALBILIRUBIN: 'T.BILI',
  TOTALPROTEIN: 'TP',
  RGT: 'GGT', 'R-GT': 'GGT',
  'INORGANIC P': 'IP', INORGANICP: 'IP', P: 'IP',
  ESTIMATEDGFR: 'EGFR', 'ESTIMATED GFR': 'EGFR',
  'CREATININE(U)': 'CREATININE', CREATININEU: 'CREATININE',
  SGOTAST: 'AST', SGPTALT: 'ALT',
  TROPONINI: 'TROP', TROPONINT: 'TROP',
  // Lipid extras
  'T-CHOLESTEROL': 'CHOL', TCHOLESTEROL: 'CHOL', 'TOTAL CHOL': 'CHOL',
  'LDL-CHOLESTEROL': 'LDL', LDLCHOLESTEROL: 'LDL',
  'LDL-C(DIRECT)': 'LDL', LDLCDIRECT: 'LDL',
  // Thyroid extras
  'FREE-T4': 'FREE T4', FREET4: 'FREE T4',
  'FREE-T3': 'FREE T3', FREET3: 'FREE T3',
}

// Aggressively normalize a test display name so equivalent variants merge.
// Examples:
//   "Creatinine(B)" → "CREATININE"
//   "Creatinine(Bloo..." → "CREATININE"
//   "MCV 平均紅血球體積" → "MCV"
//   "WBC(白血球..." → "WBC"
//   "Glucose(AC)(飯..." → "GLUCOSEAC"
//   "Hb-A1c" → "HBA1C"
//   "Serum Free T4(E..." → "FREET4"
//   "Platelet ccount ..." → "PLATELETCCOUNT"
function normalizeTestName(raw: string): { stripped: string; collapsed: string } {
  let s = raw.trim()
  // Strip everything after first paren/bracket (ASCII or CJK)
  s = s.replace(/\s*[\(\[（［].*$/, '')
  // Strip trailing CJK characters and whatever follows
  s = s.replace(/\s*[一-鿿].*$/, '')
  // Strip trailing ellipsis / dots that mark truncated names
  s = s.replace(/[.…]+\s*$/, '').trim()
  // Strip qualifier prefixes
  s = s.replace(/^Serum\s+/i, '')
  s = s.trim()
  const stripped = s.toUpperCase()
  // Collapse all non-alphanumeric (hyphens, dots, spaces) for fuzzy matching
  const collapsed = stripped.replace(/[^A-Z0-9]/g, '')
  return { stripped, collapsed }
}

function pickKey(obs: any): string {
  const raw = getTestDisplayName(obs)
  if (!raw) return 'UNKNOWN'
  const { stripped, collapsed } = normalizeTestName(raw)
  // Try exact stripped match first (preserves things like "T.BILI" vs "TBILI")
  if (TEST_ALIASES[stripped]) return TEST_ALIASES[stripped]
  // Try collapsed match (handles "Hb-A1c", "HB A1C", "HbA1c" all → HBA1C)
  if (TEST_ALIASES[collapsed]) return TEST_ALIASES[collapsed]
  // Fallback: use stripped form
  return stripped || collapsed || raw.toUpperCase()
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
