// Shared test name normalization — used by both the cumulative lab pivot
// and the observation trend history so cross-institution name variants
// (e.g. "S.G.O.T (AST)" vs "SGOT (AST)") resolve to the same canonical key.

export const TEST_ALIASES: Record<string, string> = {
  // Creatinine
  CREATININE: 'CREA', CREAT: 'CREA', 'CREAT.': 'CREA', CREA: 'CREA',
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
  // APTT ratio (LOINC 63561-5, "aPTT --actual/normal", value=APTT/control_mean).
  // Clinical convention treats APTT in seconds as the primary result; this
  // ratio is a secondary, derived metric. The two share NHI 醫令碼 08036C and
  // bridge sends them in the same DR, so without this split alias they
  // collapse to the same `APTT` row and last-write-wins clobbers the seconds
  // value (whichever obs comes last in the bundle wins the cell). Rawupper
  // match catches "APTT (ratio)" BEFORE normalizeTestName strips the parens.
  'APTT (RATIO)': 'APTT-RATIO', 'APTT-RATIO': 'APTT-RATIO',
  INR: 'INR',
  'D-DIMER': 'D-DIMER', DDIMER: 'D-DIMER', 'D DIMER': 'D-DIMER',
  FDP: 'FDP',
  FIBRINOGEN: 'FIB', FIB: 'FIB',
  // Electrolytes
  NA: 'NA', SODIUM: 'NA',
  K: 'K', POTASSIUM: 'K',
  CL: 'CL', CHLORIDE: 'CL',
  CA: 'CA', CALCIUM: 'CA', CACAL: 'CA', '鈣': 'CA',
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
  UA: 'UA', URATE: 'UA', 'URIC ACID': 'UA',
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
  // Endocrine: short clinical aliases
  PROLACTIN: 'PRL', PRL: 'PRL',
  ESTRADIOL: 'E2', E2: 'E2',
  // Tumor markers
  PSA: 'PSA', TPSA: 'PSA', 'T-PSA': 'PSA', 'TOTAL PSA': 'PSA', 'PROSTATE SPECIFIC AG': 'PSA', 'PROSTATE-SPECIFIC AG': 'PSA', 'PROSTATE SPECIFIC ANTIGEN': 'PSA', 'PROSTATE-SPECIFIC ANTIGEN': 'PSA',
  FPSA: 'F-PSA', 'F-PSA': 'F-PSA', 'PSA-F': 'F-PSA', 'FREE PSA': 'F-PSA',
  CEA: 'CEA', 'CARCINOEMBRYONIC ANTIGEN': 'CEA',
  AFP: 'AFP', 'ALPHA FETOPROTEIN': 'AFP', 'ALPHA-FETOPROTEIN': 'AFP',
  'CA-125': 'CA-125', CA125: 'CA-125', 'CA 125': 'CA-125',
  'CA-153': 'CA-153', CA153: 'CA-153', 'CA 15-3': 'CA-153',
  'CA-199': 'CA-199', CA199: 'CA-199', 'CA19-9': 'CA-199', 'CA 19-9': 'CA-199',
  FERRITIN: 'FERRITIN',
  // Hepatitis B surface antigen — paired with Anti-HCV for HCC screening
  HBSAG: 'HBSAG', 'HBS AG': 'HBSAG', 'HBS-AG': 'HBSAG',
  'HEPATITIS B SURFACE ANTIGEN': 'HBSAG', 'HEPATITIS B SURFACE AG': 'HBSAG',
  HCG: 'HCG', 'BETA HCG': 'HCG', 'BETA-HCG': 'HCG', 'B-HCG': 'HCG',
  // Glycated hemoglobin
  HBA1C: 'HBA1C', 'HB-A1C': 'HBA1C', 'HB A1C': 'HBA1C',
  HBA1: 'HBA1C', A1C: 'HBA1C',
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
  'CREATININE(U)': 'CREA', CREATININEU: 'CREA',
  SGOTAST: 'AST', SGPTALT: 'ALT',
  TROPONINI: 'TROP', TROPONINT: 'TROP',
  'T-CHOLESTEROL': 'CHOL', TCHOLESTEROL: 'CHOL', 'TOTAL CHOL': 'CHOL',
  'LDL-CHOLESTEROL': 'LDL', LDLCHOLESTEROL: 'LDL',
  'LDL-C(DIRECT)': 'LDL', LDLCDIRECT: 'LDL',
  'FREE-T4': 'FREE T4', FREET4: 'FREE T4', FT4: 'FREE T4',
  'T4 FREE': 'FREE T4', T4FREE: 'FREE T4', 'T4-FREE': 'FREE T4',
  'FREE-T3': 'FREE T3', FREET3: 'FREE T3', FT3: 'FREE T3',
  'T3 FREE': 'FREE T3', T3FREE: 'FREE T3', 'T3-FREE': 'FREE T3',

  // ── Chinese-only display names (no English prefix) ─────────────────────
  // Bridge passes through whatever the source EHR sent as code.text. Some
  // hospitals send pure Chinese names for CBC differential cells (e.g.
  // "嗜中性白血球" instead of "Neutrophil"). normalizeTestName() strips CJK
  // characters that follow a Latin prefix but leaves pure-CJK strings as-is,
  // so we need explicit raw-form aliases here. Without these the same
  // analyte from two hospitals (one English, one Chinese) appears as two
  // separate columns in the cumulative report next to the pinnedColumn stub.
  //
  // We deliberately match by display-text (not LOINC) so that bridge mis-
  // labels — e.g. a band-form row tagged with the neutrophil LOINC — keep
  // their distinct Chinese label and remain visible as bridge bugs.
  // CBC differential
  '嗜中性白血球': 'NEU', '帶狀嗜中性白血球': 'BAND',
  '淋巴球': 'LYM', '單核球': 'MONO',
  '嗜伊紅性白血球': 'EOS', '嗜酸性白血球': 'EOS',
  '嗜鹼性白血球': 'BASO',
  '後骨髓球': 'META-MYELOCYTE', 'META-MYELOCYTE': 'META-MYELOCYTE',
  // CBC counts / indices
  '白血球計數': 'WBC', '紅血球計數': 'RBC', '血色素檢查': 'HB',
  '血球比容值測定': 'HCT', '血小板計數': 'PLT',
  '紅血球平均容積': 'MCV', '紅血球色素': 'MCH', '紅血球色素濃度': 'MCHC',
  '紅血球分佈變異數': 'RDW',
  // Common chem Chinese variants
  '全膽紅素': 'T.BILI', '膽紅素總量': 'T.BILI',
  '肌酐': 'CREA', '肌酸酐': 'CREA', '肌酸酐、血': 'CREA',
  '乳酸': 'LACTATE',
}

/**
 * LOINC → canonical analyte key map.
 *
 * Every entry here is sourced from NHI-FHIR-Bridge's verified NHI_TO_LOINC
 * table (packages/mapper/src/loinc-tables.ts, post v0.6.7 audit). Each LOINC
 * was confirmed against loinc.org during the 2026-05-19 bridge audit
 * (docs/LOINC_AUDIT_2026_05_19.md). Comments cite the originating NHI 醫令碼
 * so it's traceable.
 *
 * Rules for adding new entries here:
 *   1. Cross-reference NHI-FHIR-Bridge `NHI_TO_LOINC` first.
 *   2. If not in the bridge, fetch loinc.org/<code>/ and confirm:
 *        - Long Common Name matches the analyte intent
 *        - Specimen and Property (mass/molar concentration) make sense
 *   3. NEVER guess from memory or LOINC code proximity (see audit
 *      "Pattern observation" — wrong LOINCs in this repo have historically
 *      come from copy-paste errors and fat-finger code numbers).
 */
export const LOINC_TO_CANONICAL: Record<string, string> = {
  // ── Thyroid ───────────────────────────────────────────────
  // 3024-7 = Thyroxine (T4) free [Mass/volume] in Serum or Plasma (ng/dL)
  // 14920-3 = Thyroxine (T4) free [Moles/volume] in Serum or Plasma (pmol/L)
  // Both are Free T4 (different unit systems). Bridge audit §F.
  '3024-7':  'FREE T4',
  '14920-3': 'FREE T4',
  '3016-3':  'TSH',           // NHI 09112C — Thyrotropin S/P

  // ── Liver / bilirubin / protein ───────────────────────────
  '1742-6': 'ALT',            // NHI 09026C — Alanine aminotransferase Act S/P
  '1920-8': 'AST',            // NHI 09025C — Aspartate aminotransferase Act S/P
  '6768-6': 'ALK-P',          // NHI 09027C — Alkaline phosphatase Act S/P
  '2324-2': 'GGT',            // NHI 09031C — Gamma glutamyl transferase Act S/P
  '2532-0': 'LDH',            // NHI 09033C — LDH Activity S/P
  '1975-2': 'T.BILI',         // NHI 09029C — Bilirubin total Mass/vol S/P
  '1968-7': 'D.BILI',         // NHI 09030C — Bilirubin direct Mass/vol S/P
  '1751-7': 'ALB',            // NHI 09038C / 12112B — Albumin Mass/vol S/P

  // ── Renal ─────────────────────────────────────────────────
  '2160-0': 'CREA',           // NHI 09015C — Creatinine Mass/vol S/P
  '3094-0': 'BUN',            // NHI 09002C — Urea nitrogen Mass/vol S/P
  '3084-1': 'UA',             // NHI 09013C — Urate Mass/vol S/P

  // ── Electrolytes / minerals ───────────────────────────────
  '2951-2':  'NA',            // NHI 09021C — Sodium Moles/vol S/P
  '2823-3':  'K',             // NHI 09022C — Potassium Moles/vol S/P
  '17861-6': 'CA',            // NHI 09011C — Calcium Mass/vol S/P
  '2777-1':  'IP',            // NHI 09012C — Phosphate Mass/vol S/P

  // ── Inflammation / cardiac ────────────────────────────────
  '1988-5':  'CRP',           // NHI 12015C — C reactive protein Mass/vol S/P
  '33959-8': 'PCT',           // NHI 12192C — Procalcitonin Mass/vol S/P
  '10839-9': 'TROP',          // NHI 09099C — Troponin I cardiac S/P

  // ── CBC ───────────────────────────────────────────────────
  '6690-2': 'WBC',            // NHI 08002C — Leukocytes #/vol Blood Auto
  '718-7':  'HB',             // NHI 08003C — Hemoglobin Mass/vol Blood
  '777-3':  'PLT',            // NHI 08006C — Platelets #/vol Blood Auto
  '4544-3': 'HCT',            // NHI 08004C — Hematocrit volume fraction Blood
  '789-8':  'RBC',            // bridge LOINC_MAP — Erythrocytes #/vol Blood Auto
  '785-6':  'MCH',            // bridge LOINC_MAP — RBC mean corpuscular Hgb
  '711-2':  'EOS',            // NHI 08010C — Eosinophils #/vol Blood Auto
                              //   (earlier 706-2 entry was unverified — removed)

  // ── Lipid ─────────────────────────────────────────────────
  '2093-3':  'CHOL',          // NHI 09001C — Cholesterol Mass/vol S/P
  '2571-8':  'TG',            // NHI 09004C — Triglyceride Mass/vol S/P
  '2085-9':  'HDL',           // NHI 09043C — HDL Cholesterol Mass/vol S/P
  '13457-7': 'LDL',           // NHI 09044C — LDL Cholesterol (calculated) Mass/vol S/P

  // ── Glucose / HbA1c ───────────────────────────────────────
  '1558-6': 'GLUCOSE-AC',     // NHI 09005C — Fasting glucose Mass/vol S/P
  '2345-7': 'GLUCOSE',        // NHI 09140C — Glucose Mass/vol S/P
  '4548-4': 'HBA1C',          // NHI 09006C — Hemoglobin A1c / Hgb.total Blood

  // ── Coag ──────────────────────────────────────────────────
  '6301-6':  'INR',           // NHI 08026C — PT/INR Platelet poor plasma
  '14979-9': 'APTT',          // NHI 08036C — APTT Platelet poor plasma
  '30240-6': 'D-DIMER',       // NHI 08079B — D-dimer Plt poor plasma

  // ── Hormones (sex/adrenal) ────────────────────────────────
  '2986-8':  'TESTOSTERONE',  // NHI 09121C — Testosterone Mass/vol S/P
  '2991-8':  'F-TESTOSTERONE',// NHI 27021B — Free Testosterone S/P
  '83098-4': 'FSH',           // NHI 09125C — Follitropin Immunoassay S/P (corrected post-audit)
  '83096-8': 'E2',            // NHI 09127C — Estradiol Immunoassay S/P (corrected post-audit)
  '2143-6':  'CORTISOL',      // NHI 09113C — Cortisol Mass/vol S/P

  // ── Tumor markers / ferritin ──────────────────────────────
  '1834-1':  'AFP',           // NHI 12007C / 27049C — AFP Mass/vol S/P
  '2039-6':  'CEA',           // NHI 12021C — CEA Mass/vol S/P
  '24108-3': 'CA-199',        // NHI 12079C — CA 19-9 Mass/vol S/P
                              //   (earlier label "CA-125" was WRONG — verified
                              //   24108-3 is CA 19-9 per bridge audit)
  '2857-1':  'PSA',           // NHI 27052C — PSA Mass/vol S/P (older LOINC)
  '83112-3': 'PSA',           // NHI 12081C — PSA EIA/LIA Mass/vol S/P (audit-verified)
  '10886-0': 'F-PSA',         // NHI 27083B — Free PSA Mass/vol S/P (RIA)
                              //   (earlier label "PSA" was WRONG — this is Free PSA)
  '83113-1': 'F-PSA',         // NHI 12198C — Free PSA Mass/vol S/P (audit-verified)
  '2276-4':  'FERRITIN',      // NHI 12116C — Ferritin Mass/vol S/P

  // ── Hepatitis ─────────────────────────────────────────────
  '5195-3':  'HBSAG',         // NHI 14030C / 14031C — HBsAg Presence S/P
  '5196-1':  'HBSAG',         // NHI 14032C — HBsAg Mass/vol S/P
  '5197-9':  'HBSAG',         // NHI 27033C — HBsAg RIA S/P
  '13955-0': 'ANTI-HCV',      // NHI 14051C — HCV Ab S/P
}

// Set of every canonical analyte key the pivot is willing to render as a
// column header directly (without falling back to the obs's raw NHI display).
// Built from every alias-target the canonicalisation paths can produce.
//
// Why we need this: when bridge attaches an NHI panel name as the LOINC
// coding's `display` (e.g. "白血球分類計數" for a "嗜中性白血球" obs), the
// nhiDisplay field of the obs is the PANEL name, not the analyte name.
// useLabPivot.buildTestEntry historically preferred nhiDisplay over the
// canonical testKey when picking the column header, which produced
// Chinese panel-name headers like "白血球分類計數" instead of "NEU".
// Checking against this set lets buildTestEntry detect "testKey is itself
// a canonical short code" and use it directly.
export const CANONICAL_KEYS: Set<string> = new Set([
  ...Object.values(TEST_ALIASES),
  ...Object.values(LOINC_TO_CANONICAL),
  'GLUCOSE-AC', 'GLUCOSE-FS', 'GLUCOSE', // glucose subtype keys
])

/**
 * Try to resolve a canonical analyte key from an Observation's coding list.
 * Iterates ALL coding entries (NHI / local codes often sit in coding[0],
 * LOINC may be in [1] or [2]) and returns the first LOINC hit, or null.
 */
export function canonicalKeyFromLoinc(obs: any): string | null {
  const codings = Array.isArray(obs?.code?.coding) ? obs.code.coding : []
  for (const c of codings) {
    const code = c?.code
    if (typeof code === 'string' && LOINC_TO_CANONICAL[code]) {
      return LOINC_TO_CANONICAL[code]
    }
  }
  return null
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

// Pretty display overrides for canonical keys whose default uppercase form
// is visually loud. Add sparingly; most canonical keys (WBC, NEU, APTT, …)
// display fine as-is. Currently only used for the seconds/ratio split where
// "APTT-RATIO" reads better lowercased.
//
// CANONICAL_KEYS is defined further down — after LOINC_TO_CANONICAL — so it
// can spread that map's values too.
export const CANONICAL_DISPLAY: Record<string, string> = {
  'APTT-RATIO': 'APTT-ratio',
}

/**
 * Returns the canonical short-code label for an Observation (or panel
 * component) when the analyte is recognized — e.g. obs with `code.text='鈉'`
 * and LOINC 2951-2 → 'NA'; obs with `code.text='乳酸'` and LOINC 14118-4
 * → 'LACTATE'. Falls back to the bridge-provided `code.text` (or coding
 * display) when the analyte isn't in CANONICAL_KEYS — microbiology cultures,
 * antibiotic susceptibilities, and other non-standard rows stay as-is.
 *
 * Use this anywhere the UI renders a single-analyte label so clinicians
 * see the short English code they're used to (Na / K / BUN / WBC) instead
 * of whichever Chinese / English / parenthetical variant the source
 * hospital happened to send. The cumulative-report column header
 * (`buildTestEntry` in useLabPivot) uses the same resolution path so all
 * views stay in sync.
 */
export function getAnalyteLabel(obsOrComponent: { code?: any } | null | undefined): string {
  const code = obsOrComponent?.code
  if (!code) return '—'
  // 1. Prefer LOINC-derived canonical when available.
  const fromLoinc = canonicalKeyFromLoinc(obsOrComponent as any)
  if (fromLoinc && CANONICAL_KEYS.has(fromLoinc)) {
    return CANONICAL_DISPLAY[fromLoinc] || fromLoinc
  }
  // 2. Try text-based alias resolution (handles obs without LOINC, or with
  //    LOINCs not yet in LOINC_TO_CANONICAL — e.g. bridge-emitted Chinese
  //    display where the alias map has the Chinese form).
  const raw = (code.text || code.coding?.[0]?.display || '') as string
  if (raw) {
    const fromText = canonicalTestKeyFromString(raw)
    if (CANONICAL_KEYS.has(fromText)) {
      return CANONICAL_DISPLAY[fromText] || fromText
    }
  }
  // 3. Fall back to whatever the bridge sent — non-lab obs (cultures, panels,
  //    free-text reports) keep their source label.
  return raw || (code.coding?.[0]?.code as string) || '—'
}

// Returns the canonical analyte key for a raw display-name string.
// "S.G.O.T (AST)" → "AST", "SGOT (AST)" → "AST", "ALT/GPT" → "ALT", etc.
//
// Tries the raw input first so pure-CJK names like "嗜中性白血球" — which
// normalizeTestName would strip to "" — still hit the Chinese-name aliases
// before falling through to the normalized form. Mirrors canonicalTestKey
// in useLabPivot so both pathways agree.
export function canonicalTestKeyFromString(raw: string): string {
  if (!raw) return 'UNKNOWN'
  if (TEST_ALIASES[raw]) return TEST_ALIASES[raw]
  const rawUpper = raw.toUpperCase()
  if (TEST_ALIASES[rawUpper]) return TEST_ALIASES[rawUpper]
  const { stripped, collapsed } = normalizeTestName(raw)
  if (TEST_ALIASES[stripped]) return TEST_ALIASES[stripped]
  if (TEST_ALIASES[collapsed]) return TEST_ALIASES[collapsed]
  return stripped || collapsed || rawUpper
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
