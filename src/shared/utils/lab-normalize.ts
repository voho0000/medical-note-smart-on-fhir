// Shared test name normalization — used by both the cumulative lab pivot
// and the observation trend history so cross-institution name variants
// (e.g. "S.G.O.T (AST)" vs "SGOT (AST)") resolve to the same canonical key.

export const TEST_ALIASES: Record<string, string> = {
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
  // Glucose (GLUCOSC is a known typo from some VGH bridge data)
  GLU: 'GLUCOSE', GLUCOSE: 'GLUCOSE', GLUCOSC: 'GLUCOSE',
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
  // Procalcitonin
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
  // Tumor markers
  PSA: 'PSA', TPSA: 'PSA', 'T-PSA': 'PSA', 'TOTAL PSA': 'PSA', 'PROSTATE SPECIFIC AG': 'PSA', 'PROSTATE-SPECIFIC AG': 'PSA', 'PROSTATE SPECIFIC ANTIGEN': 'PSA', 'PROSTATE-SPECIFIC ANTIGEN': 'PSA',
  FPSA: 'F-PSA', 'F-PSA': 'F-PSA', 'PSA-F': 'F-PSA', 'FREE PSA': 'F-PSA',
  CEA: 'CEA', 'CARCINOEMBRYONIC ANTIGEN': 'CEA',
  AFP: 'AFP', 'ALPHA FETOPROTEIN': 'AFP', 'ALPHA-FETOPROTEIN': 'AFP',
  'CA-125': 'CA-125', CA125: 'CA-125', 'CA 125': 'CA-125',
  'CA-153': 'CA-153', CA153: 'CA-153', 'CA 15-3': 'CA-153',
  'CA-199': 'CA-199', CA199: 'CA-199', 'CA19-9': 'CA-199', 'CA 19-9': 'CA-199',
  FERRITIN: 'FERRITIN',
  HCG: 'HCG', 'BETA HCG': 'HCG', 'BETA-HCG': 'HCG', 'B-HCG': 'HCG',
  // Glycated hemoglobin
  HBA1C: 'HBA1C', 'HB-A1C': 'HBA1C', 'HB A1C': 'HBA1C',
  'HEMOGLOBIN A1C': 'HBA1C', 'HEMOGLOBINA1C': 'HBA1C',
  'GLYCATED HEMOGLOBIN': 'HBA1C', GLYCATEDHEMOGLOBIN: 'HBA1C',
  'GLYCOHEMOGLOBIN': 'HBA1C',
  // Glucose variants
  'GLU-AC': 'GLUCOSE', GLUAC: 'GLUCOSE', 'GLUCOSE AC': 'GLUCOSE', GLUCOSEAC: 'GLUCOSE',
  'GLUCOSE(AC)': 'GLUCOSE', 'GLU(AC)': 'GLUCOSE',
  'FINGER SUGAR': 'GLUCOSE', FINGERSUGAR: 'GLUCOSE',
  'FASTING GLUCOSE': 'GLUCOSE', FASTINGGLUCOSE: 'GLUCOSE',
  SUGAR: 'GLUCOSE',
  // Collapsed-form lookups
  WBCCOUNT: 'WBC',
  RBCCOUNT: 'RBC',
  PLATELETCOUNT: 'PLT', PLATELETCCOUNT: 'PLT',
  HT: 'HCT', HTCT: 'HCT',
  NEUTROPHILSEGMENTED: 'NEU', NEUTROPHILICSEGMENTED: 'NEU',
  NEUTROPHILICSEG: 'NEU', NEUTROPHILICSE: 'NEU',
  SEGS: 'NEU', SEGMENT: 'NEU',
  EOSINOPHILCOUNT: 'EOS', EOSINOPHILCOUN: 'EOS',
  ALBUMINBCG: 'ALB',
  TOTALBILIRUBIN: 'T.BILI',
  TOTALPROTEIN: 'TP',
  RGT: 'GGT', 'R-GT': 'GGT',
  'INORGANIC P': 'IP', INORGANICP: 'IP', P: 'IP',
  ESTIMATEDGFR: 'EGFR', 'ESTIMATED GFR': 'EGFR',
  'CREATININE(U)': 'CREATININE', CREATININEU: 'CREATININE',
  SGOTAST: 'AST', SGPTALT: 'ALT',
  TROPONINI: 'TROP', TROPONINT: 'TROP',
  'T-CHOLESTEROL': 'CHOL', TCHOLESTEROL: 'CHOL', 'TOTAL CHOL': 'CHOL',
  'LDL-CHOLESTEROL': 'LDL', LDLCHOLESTEROL: 'LDL',
  'LDL-C(DIRECT)': 'LDL', LDLCDIRECT: 'LDL',
  'FREE-T4': 'FREE T4', FREET4: 'FREE T4', FT4: 'FREE T4',
  'FREE-T3': 'FREE T3', FREET3: 'FREE T3', FT3: 'FREE T3',
}

// Normalize a raw test display name: strips parens, CJK, prefixes, then
// returns both a stripped form and a fully collapsed (no separators) form.
export function normalizeTestName(raw: string): { stripped: string; collapsed: string } {
  let s = raw.trim()
  s = s.replace(/\s*[\(\[（［].*$/, '')
  s = s.replace(/\s*[一-鿿].*$/, '')
  s = s.replace(/[.…]+\s*$/, '').trim()
  s = s.replace(/^Serum\s+/i, '')
  s = s.trim()
  const stripped = s.toUpperCase()
  const collapsed = stripped.replace(/[^A-Z0-9]/g, '')
  return { stripped, collapsed }
}

// Returns the canonical analyte key for a raw display-name string.
// "S.G.O.T (AST)" → "AST", "SGOT (AST)" → "AST", "ALT/GPT" → "ALT", etc.
export function canonicalTestKeyFromString(raw: string): string {
  if (!raw) return 'UNKNOWN'
  const { stripped, collapsed } = normalizeTestName(raw)
  if (TEST_ALIASES[stripped]) return TEST_ALIASES[stripped]
  if (TEST_ALIASES[collapsed]) return TEST_ALIASES[collapsed]
  return stripped || collapsed || raw.toUpperCase()
}

// ── Glucose subclassification ───────────────────────────────────────────────
// EHR-FHIR-Bridge is "faithful transport" — it doesn't reinterpret display
// strings, just maps NHI codes to LOINC. Subclassification (fasting / finger /
// generic) is the SMART app's job because we have UI context and rules can
// evolve. Bridge gives us LOINC + NHI code + raw code.text — all trustworthy.

export type GlucoseSubtype = 'finger' | 'fasting' | 'generic'

export const GLUCOSE_SUBTYPE_LABEL: Record<GlucoseSubtype, { key: string; display: string }> = {
  fasting: { key: 'GLUCOSE-AC', display: 'Glu-AC' },
  finger:  { key: 'GLUCOSE-FS', display: 'Finger Sugar' },
  generic: { key: 'GLUCOSE',    display: 'Glucose' },
}

/**
 * Classify a glucose observation into fasting / finger-stick / generic.
 *
 * Priority order matters:
 *  1. Finger-stick — display-only signal (highest priority).
 *  2. Fasting — LOINC 1558-6 or display indicators.
 *  3. Generic — random / post-meal / venous (default).
 *
 * Why order matters: hospitals sometimes bill finger sugar with NHI 09005C →
 * bridge maps to LOINC 1558-6, but code.text still says "FINGER SUGAR". The
 * display string is the source of truth for finger-stick — LOINC can't be
 * trusted here because the NHI billing code drove the LOINC mapping.
 */
export function classifyGlucose(obs: any): GlucoseSubtype {
  const codings = Array.isArray(obs?.code?.coding) ? obs.code.coding : []
  const textParts = [
    obs?.code?.text,
    ...codings.map((c: any) => c?.display),
  ].filter(Boolean).join(' ')

  // 1. Finger-stick — display-only signal
  if (/finger\s*sugar|指尖血糖|自我監測血糖|微血管/i.test(textParts)) {
    return 'finger'
  }

  // 2. Fasting — LOINC 1558-6 or display indicators
  if (codings.some((c: any) => c?.code === '1558-6')) {
    return 'fasting'
  }
  if (/glu[-\s]*ac|空腹血糖|飯前血糖|\bfbs\b|\bfpg\b|fasting/i.test(textParts)) {
    return 'fasting'
  }

  // 3. Default: generic
  return 'generic'
}
