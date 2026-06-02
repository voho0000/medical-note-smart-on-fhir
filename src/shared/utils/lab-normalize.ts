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
  // Bilirubin (serum) — bare 'BILIRUBIN' is deliberately NOT mapped here.
  // The urine-section block below also has 'BILIRUBIN': 'BILI', and a flat
  // Record can only hold one (latter wins at runtime — tsc TS1117 errors
  // if both are present). Serum bilirubin text-fallback relies on LOINC
  // 1975-2 (in LOINC_TO_CANONICAL → T.BILI) and the explicit variants below.
  'T.BILI': 'T.BILI', 'T.BILI.': 'T.BILI', TBILI: 'T.BILI', BILIT: 'T.BILI', 'TOTAL BILIRUBIN': 'T.BILI',
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

  // ── Urinalysis text variants ─────────────────────────────────────────
  // Bridge sends multiple text variants for the same urinalysis LOINC
  // (e.g. 5811-5 specific gravity → both "SP.Gravity" and "比重"). These
  // aliases collapse them onto the canonical urinalysis short code used
  // in `urine.preferredOrder` / `urine.codes`. We deliberately do NOT add
  // the underlying LOINCs (5778-6, 5811-5, 5794-3, 5799-2, 14957-5, 2161-8)
  // to LOINC_TO_CANONICAL — keeping the canonical resolution text-based
  // means bridge mis-tags (e.g. 5778-6 Color used for RBC/WBC/PH) stay
  // visible as their own columns instead of silently merging.
  // Color / 顏色
  '顏色': 'COLOR',
  // pH / 酸鹼值
  '酸鹼值': 'PH',
  // Specific gravity / 比重
  '比重': 'GRAVIT', 'SP.Gravity': 'GRAVIT', 'SP.GRAVITY': 'GRAVIT',
  'Specific Gravity': 'GRAVIT', 'SPECIFIC GRAVITY': 'GRAVIT',
  // Turbidity / Appearance / 濁度
  '濁度': 'TURBIDITY', 'Turbidity': 'TURBIDITY',
  // Occult blood (urine) / 尿潛血 / Blood — bridge uses bare "Blood" for the
  // urine dipstick occult-blood reading; in urinalysis context that's OCCULT.
  '尿潛血': 'OCCULT', 'OCCULTBLOOD': 'OCCULT', 'Blood': 'OCCULT', 'BLOOD': 'OCCULT',
  // Leukocyte esterase / 白血球酯脢 / WBC esterase
  '白血球酯脢': 'LE', 'WBC esterase': 'LE', 'WBC ESTERASE': 'LE', 'WBCESTERASE': 'LE',
  // Urine creatinine / 肌酐、尿 / Urine Creatinine — canonicalise to CREA so
  // they merge with the bare-text 'Creatinine' obs that already alias to CREA
  // via the chem CREATININE entry. Urine-tab CREA column is separate from
  // chem-tab CREA column (each LabCategory has its own testMap).
  '肌酐、尿': 'CREA', 'Urine Creatinine': 'CREA', 'URINE CREATININE': 'CREA', 'URINECREATININE': 'CREA',
  // Microalbumin / Micro Albumin / MALB(U)
  'Micro Albumin:': 'MALB', 'MICRO ALBUMIN:': 'MALB', 'Micro Albumin': 'MALB', 'MICRO ALBUMIN': 'MALB',
  'MALB(U)(半定量)': 'MALB', 'MALB(U)': 'MALB',
  // Urine protein / 尿蛋白
  'Urine Protein': 'PROT', 'URINE PROTEIN': 'PROT', 'URINEPROTEIN': 'PROT', '尿蛋白': 'PROT',
  // Bilirubin urine — '膽紅素' / 'Bilirubin' all collapse onto BILI (the
  // urine pinned-column canonical). Serum bilirubin in chem uses its
  // own LOINC route (1975-2 → T.BILI) so it's unaffected by these aliases.
  '膽紅素': 'BILI', 'Bilirubin': 'BILI', 'BILIRUBIN': 'BILI',
  // Urobilinogen / 尿膽素原 — canonicalise to UROBI (matches urine.preferredOrder)
  '尿膽素原': 'UROBI', '尿膽素元': 'UROBI',
  'Urobilinogen': 'UROBI', 'UROBILINOGEN': 'UROBI',
  // Appearance — bridge uses "Appearance" / "Turbidity" / "濁度" for the same
  // visual-clarity reading (LOINC 5767-9). All collapse to TURBIDITY.
  'Appearance': 'TURBIDITY', 'APPEARANCE': 'TURBIDITY',
  // ACR vs UACR — same albumin/creatinine ratio test.
  'UACR': 'ACR',
  // Glucose urine
  '尿糖': 'GLUCOSE',
  // Nitrite / 亞硝酸鹽
  '亞硝酸鹽': 'NITRITE',
  // Ketone / 酮體
  '酮體': 'KETONE',
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
  '2075-0':  'CL',            // Chloride Moles/vol S/P — verified loinc.org 2026-06-02
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

  // ──────────────────────────────────────────────────────────
  // Added 2026-05-29 — coverage expansion based on v0.12.1
  // multi-bundle audit. All verified at loinc.org (see memory
  // feedback_loinc_verification.md). The systemic root cause for
  // recurring "Chinese label leaks into UI" complaints was an
  // under-covered LOINC map — bridge attaches the correct LOINC
  // for these analytes but app fell through to display-text
  // because the LOINC wasn't recognised.
  // ──────────────────────────────────────────────────────────

  // ── CBC indices (RBC erythrocyte indices) ─────────────────
  // Bridge uses these LOINCs correctly across all observed bundles.
  // Adding here so 紅血球色素濃度 / 紅血球平均容積 etc. canonicalise
  // via LOINC rather than relying on Chinese text aliases alone.
  '786-4':  'MCHC',           // MCHC [Entitic Mass/vol] in RBC Auto count
  '787-2':  'MCV',            // MCV [Entitic mean vol] in RBC Auto count
  '788-0':  'RDW',            // Erythrocyte [DistWidth] in Blood Auto (%)

  // ── Chem (additional) ─────────────────────────────────────
  '2028-9':  'CO2',           // NHI 09023C — Carbon dioxide Moles/vol S/P
                              //   (TCO2; usually reported in metabolic panel)
  '33914-3': 'EGFR(M)',       // NHI 09015C variant — GFR by MDRD formula
                              //   (loinc.org marks discouraged in favour of
                              //   77147-7, but bridge still emits this code;
                              //   matches existing chem.preferredOrder slot
                              //   'EGFR(M)' for MDRD)
  '19123-9': 'MG',            // NHI 09046B — Magnesium Mass/vol S/P
  '3040-3':  'LIPASE',        // NHI 09053C — Lipase Enz act/vol S/P
  '14118-4': 'LACTATE',       // NHI 09059B — Lactate Mass/vol S/P
                              //   (chem.codes already lists 'LACTATE'; this
                              //   adds the LOINC route so Chinese 乳酸
                              //   and English Lactate (B) both canonicalise.)

  // ── Immunoglobulins ──────────────────────────────────────
  '2465-3': 'IGG',            // IgG Mass/vol S/P
  '2458-8': 'IGA',            // IgA Mass/vol S/P
  '2472-9': 'IGM',            // IgM Mass/vol S/P

  // ── Autoimmunity ─────────────────────────────────────────
  '5048-4': 'ANA',            // Nuclear Ab Titer by Immunofluorescence

  // ── Vitamins / hematopoiesis cofactors ────────────────────
  '2284-8': 'FOLATE',         // Folate Mass/vol S/P
  '2132-9': 'B12',            // Cobalamin (Vit B12) Mass/vol S/P

  // ── Cardiac / heart failure markers ──────────────────────
  '33762-6': 'NT-PROBNP',     // NT-proBNP Mass/vol S/P

  // ── CBC (additional) ─────────────────────────────────────
  '14196-0': 'RETIC',         // Reticulocytes #/vol in Blood
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
  // Mixed-case clinical conventions — these analytes are universally
  // written in mixed case in clinical reading, so the all-uppercase
  // canonical key would look like a typo to clinicians.
  'IGG': 'IgG',
  'IGA': 'IgA',
  'IGM': 'IgM',
  'NT-PROBNP': 'NT-proBNP',
  'HBA1C': 'HbA1c',
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

// ───────────────────────────────────────────────────────────────────────────
// Audience-aware display labels
// ───────────────────────────────────────────────────────────────────────────
// Keep display label resolution separate from canonical resolution. The
// canonical key (returned by getAnalyteLabel) drives sort / categorise /
// search / AI prompt context — must stay stable English short codes. The
// label SHOWN to the user can vary by audience (medical vs patient) and
// language. See memory/feedback_display_vs_canonical_separation.md.
//
// Coverage gap policy: missing entries fall back to canonical English (e.g.
// 'CA-72_4' not in CANONICAL_TO_LAY_ZH renders as 'CA-72_4' even in patient
// mode). Surfacing the gap is preferable to silently dropping the row.

/** Canonical analyte key → 醫院慣用中文全名 (patient audience, zh-TW UI). */
export const CANONICAL_TO_LAY_ZH: Record<string, string> = {
  // ── CBC counts / indices ──────────────────────────────────
  'WBC': '白血球計數',
  'RBC': '紅血球計數',
  'HB': '血色素',
  'HCT': '血球比容值',
  'PLT': '血小板計數',
  'MPV': '血小板平均體積',
  'MCV': '紅血球平均體積',
  'MCH': '紅血球平均血色素',
  'MCHC': '紅血球平均血色素濃度',
  'RDW': '紅血球分佈寬度',
  'RETIC': '網狀紅血球',
  // ── CBC differential ──────────────────────────────────────
  'NEU': '嗜中性白血球',
  'BAND': '帶狀嗜中性白血球',
  'LYM': '淋巴球',
  'MONO': '單核球',
  'EOS': '嗜伊紅性白血球',
  'BASO': '嗜鹼性白血球',
  'ANC': '絕對嗜中性球計數',
  // ── Coagulation ───────────────────────────────────────────
  'PT': '凝血酶原時間',
  'INR': '國際標準化比值',
  'APTT': '部分凝血活酶時間',
  'APTT-RATIO': '部分凝血活酶時間比值',
  'D-DIMER': 'D-二聚體',
  'FDP': '纖維蛋白降解產物',
  'FIB': '纖維蛋白原',
  // ── Renal ─────────────────────────────────────────────────
  'BUN': '尿素氮',
  'CREA': '肌酸酐',
  'UA': '尿酸',
  'EGFR': '腎絲球過濾率',
  'EGFR(EPI)': '腎絲球過濾率 (CKD-EPI)',
  'EGFR(M)': '腎絲球過濾率 (MDRD)',
  // ── Electrolytes / minerals ───────────────────────────────
  'NA': '鈉', 'K': '鉀', 'CL': '氯', 'CA': '鈣', 'IP': '磷', 'MG': '鎂',
  'CO2': '二氧化碳總量',
  // ── Liver ─────────────────────────────────────────────────
  'AST': '麩草轉胺脢',
  'ALT': '麩丙轉胺脢',
  'T.BILI': '總膽紅素',
  'D.BILI': '直接膽紅素',
  'ALK-P': '鹼性磷酸酶',
  'GGT': '麩胺醯轉肽酶',
  'LDH': '乳酸去氫酶',
  'TP': '總蛋白',
  'ALB': '白蛋白',
  'LIPASE': '脂解酶',
  // ── Inflammation ──────────────────────────────────────────
  'CRP': 'C 反應蛋白',
  'PCT': '前降鈣素',
  'ESR': '紅血球沉降率',
  'LACTATE': '乳酸',
  'FIB-4': '肝纖維化指數 (FIB-4)',
  // ── Cardiac ───────────────────────────────────────────────
  'TROP': '心肌旋轉素',
  'CK': '肌酸激酶',
  'CKMB': '肌酸激酶 MB',
  'NT-PROBNP': 'N 端腦鈉肽前體',
  // ── Glucose / HbA1c ───────────────────────────────────────
  'GLUCOSE': '血糖',
  'GLUCOSE-AC': '空腹血糖',
  'GLUCOSE-FS': '指尖血糖',
  'HBA1C': '糖化血色素',
  'C-PEPTIDE': 'C 胜肽',
  'INSULIN': '胰島素',
  // ── Lipid ─────────────────────────────────────────────────
  'CHOL': '總膽固醇',
  'TG': '三酸甘油酯',
  'HDL': '高密度脂蛋白膽固醇',
  'LDL': '低密度脂蛋白膽固醇',
  // ── Thyroid / endocrine ───────────────────────────────────
  'TSH': '甲狀腺刺激素',
  'FREE T4': '游離甲狀腺素 T4',
  'FREE T3': '游離甲狀腺素 T3',
  'T4': '甲狀腺素 T4',
  'T3': '甲狀腺素 T3',
  'CORTISOL': '皮質醇',
  'PRL': '泌乳激素',
  'E2': '雌二醇',
  'LH': '黃體生成素',
  'FSH': '濾泡刺激素',
  'TESTOSTERONE': '睪固酮',
  'F-TESTOSTERONE': '游離睪固酮',
  'PROGESTERONE': '黃體素',
  // ── Iron / hematinics ─────────────────────────────────────
  'IRON': '血清鐵',
  'TIBC': '總鐵結合能力',
  'FERRITIN': '鐵蛋白',
  'FOLATE': '葉酸',
  'B12': '維生素 B12',
  // ── Immunoglobulins / autoimmune ──────────────────────────
  'IGG': '免疫球蛋白 G',
  'IGA': '免疫球蛋白 A',
  'IGM': '免疫球蛋白 M',
  'ANA': '抗核抗體',
  // ── Tumor markers ─────────────────────────────────────────
  'AFP': '甲型胎兒蛋白',
  'CEA': '癌胚抗原',
  'PSA': '攝護腺特異抗原',
  'F-PSA': '游離攝護腺特異抗原',
  'CA-125': '醣蛋白 125 (CA-125)',
  'CA-153': '醣蛋白 153 (CA-153)',
  'CA-199': '醣蛋白 199 (CA-199)',
  'HCG': '人類絨毛膜促性腺激素',
  // ── Hepatitis ─────────────────────────────────────────────
  'HBSAG': 'B 型肝炎表面抗原',
  'ANTI-HBS': 'B 型肝炎表面抗體',
  'ANTI-HBC': 'B 型肝炎核心抗體',
  'HBEAG': 'B 型肝炎 e 抗原',
  'ANTI-HBE': 'B 型肝炎 e 抗體',
  'HBCAG': 'B 型肝炎核心抗原',
  'ANTI-HCV': 'C 型肝炎抗體',
  // ── Urinalysis ────────────────────────────────────────────
  'COLOR': '顏色',
  'PH': '酸鹼值',
  'GRAVIT': '比重',
  'TURBIDITY': '濁度',
  'PROT': '尿蛋白',
  'KETONE': '酮體',
  'BILI': '膽紅素',
  'UROBI': '尿膽素原',
  'NITRITE': '亞硝酸鹽',
  'LE': '白血球酯酶',
  'OCCULT': '尿潛血',
  'MALB': '微量白蛋白',
  'ACR': '白蛋白/肌酸酐比值',
}

/** Canonical analyte key → long-form English (patient audience, en UI). */
export const CANONICAL_TO_LAY_EN: Record<string, string> = {
  // ── CBC counts / indices ──────────────────────────────────
  'WBC': 'White blood cell count',
  'RBC': 'Red blood cell count',
  'HB': 'Hemoglobin',
  'HCT': 'Hematocrit',
  'PLT': 'Platelet count',
  'MPV': 'Mean platelet volume',
  'MCV': 'Mean corpuscular volume',
  'MCH': 'Mean corpuscular hemoglobin',
  'MCHC': 'Mean corpuscular hemoglobin concentration',
  'RDW': 'Red cell distribution width',
  'RETIC': 'Reticulocyte count',
  // ── CBC differential ──────────────────────────────────────
  'NEU': 'Neutrophils',
  'BAND': 'Band cells',
  'LYM': 'Lymphocytes',
  'MONO': 'Monocytes',
  'EOS': 'Eosinophils',
  'BASO': 'Basophils',
  'ANC': 'Absolute neutrophil count',
  // ── Coagulation ───────────────────────────────────────────
  'PT': 'Prothrombin time',
  'INR': 'International normalized ratio',
  'APTT': 'Activated partial thromboplastin time',
  'APTT-RATIO': 'APTT ratio',
  'D-DIMER': 'D-dimer',
  'FDP': 'Fibrin degradation products',
  'FIB': 'Fibrinogen',
  // ── Renal ─────────────────────────────────────────────────
  'BUN': 'Blood urea nitrogen',
  'CREA': 'Creatinine',
  'UA': 'Uric acid',
  'EGFR': 'Estimated GFR',
  'EGFR(EPI)': 'Estimated GFR (CKD-EPI)',
  'EGFR(M)': 'Estimated GFR (MDRD)',
  // ── Electrolytes / minerals ───────────────────────────────
  'NA': 'Sodium', 'K': 'Potassium', 'CL': 'Chloride',
  'CA': 'Calcium', 'IP': 'Phosphate', 'MG': 'Magnesium',
  'CO2': 'Total CO2',
  // ── Liver ─────────────────────────────────────────────────
  'AST': 'Aspartate aminotransferase',
  'ALT': 'Alanine aminotransferase',
  'T.BILI': 'Total bilirubin',
  'D.BILI': 'Direct bilirubin',
  'ALK-P': 'Alkaline phosphatase',
  'GGT': 'Gamma-glutamyl transferase',
  'LDH': 'Lactate dehydrogenase',
  'TP': 'Total protein',
  'ALB': 'Albumin',
  'LIPASE': 'Lipase',
  // ── Inflammation ──────────────────────────────────────────
  'CRP': 'C-reactive protein',
  'PCT': 'Procalcitonin',
  'ESR': 'Erythrocyte sedimentation rate',
  'LACTATE': 'Lactate',
  'FIB-4': 'FIB-4 fibrosis index',
  // ── Cardiac ───────────────────────────────────────────────
  'TROP': 'Troponin',
  'CK': 'Creatine kinase',
  'CKMB': 'Creatine kinase MB',
  'NT-PROBNP': 'NT-proBNP',
  // ── Glucose / HbA1c ───────────────────────────────────────
  'GLUCOSE': 'Glucose',
  'GLUCOSE-AC': 'Fasting glucose',
  'GLUCOSE-FS': 'Finger-stick glucose',
  'HBA1C': 'Glycated hemoglobin (HbA1c)',
  'C-PEPTIDE': 'C-peptide',
  'INSULIN': 'Insulin',
  // ── Lipid ─────────────────────────────────────────────────
  'CHOL': 'Total cholesterol',
  'TG': 'Triglycerides',
  'HDL': 'HDL cholesterol',
  'LDL': 'LDL cholesterol',
  // ── Thyroid / endocrine ───────────────────────────────────
  'TSH': 'Thyroid-stimulating hormone',
  'FREE T4': 'Free T4',
  'FREE T3': 'Free T3',
  'T4': 'Thyroxine (T4)',
  'T3': 'Triiodothyronine (T3)',
  'CORTISOL': 'Cortisol',
  'PRL': 'Prolactin',
  'E2': 'Estradiol',
  'LH': 'Luteinizing hormone',
  'FSH': 'Follicle-stimulating hormone',
  'TESTOSTERONE': 'Testosterone',
  'F-TESTOSTERONE': 'Free testosterone',
  'PROGESTERONE': 'Progesterone',
  // ── Iron / hematinics ─────────────────────────────────────
  'IRON': 'Serum iron',
  'TIBC': 'Total iron-binding capacity',
  'FERRITIN': 'Ferritin',
  'FOLATE': 'Folate',
  'B12': 'Vitamin B12',
  // ── Immunoglobulins / autoimmune ──────────────────────────
  'IGG': 'Immunoglobulin G',
  'IGA': 'Immunoglobulin A',
  'IGM': 'Immunoglobulin M',
  'ANA': 'Antinuclear antibody',
  // ── Tumor markers ─────────────────────────────────────────
  'AFP': 'Alpha-fetoprotein',
  'CEA': 'Carcinoembryonic antigen',
  'PSA': 'Prostate-specific antigen',
  'F-PSA': 'Free PSA',
  'CA-125': 'CA-125',
  'CA-153': 'CA 15-3',
  'CA-199': 'CA 19-9',
  'HCG': 'Human chorionic gonadotropin',
  // ── Hepatitis ─────────────────────────────────────────────
  'HBSAG': 'Hepatitis B surface antigen',
  'ANTI-HBS': 'Hepatitis B surface antibody',
  'ANTI-HBC': 'Hepatitis B core antibody',
  'HBEAG': 'Hepatitis B e antigen',
  'ANTI-HBE': 'Hepatitis B e antibody',
  'HBCAG': 'Hepatitis B core antigen',
  'ANTI-HCV': 'Hepatitis C antibody',
  // ── Urinalysis ────────────────────────────────────────────
  'COLOR': 'Color',
  'PH': 'pH',
  'GRAVIT': 'Specific gravity',
  'TURBIDITY': 'Turbidity',
  'PROT': 'Protein',
  'KETONE': 'Ketones',
  'BILI': 'Bilirubin',
  'UROBI': 'Urobilinogen',
  'NITRITE': 'Nitrite',
  'LE': 'Leukocyte esterase',
  'OCCULT': 'Occult blood',
  'MALB': 'Microalbumin',
  'ACR': 'Albumin/creatinine ratio',
}

export type AudienceMode = 'medical' | 'patient'
export type DisplayLang = 'zh-TW' | 'en'

/**
 * Resolve the display label for a canonical analyte key based on audience
 * and UI language. Medical audience always sees the canonical short code
 * (with CANONICAL_DISPLAY mixed-case overrides like APTT-ratio / HbA1c).
 * Patient audience sees the long-form translation if available, falling
 * back to canonical when the analyte isn't yet in the lay-display map.
 *
 * Pure function — no React context, so it can be called from any layer
 * (render, hook, test).
 */
export function getAnalyteDisplayLabel(
  canonical: string,
  audience: AudienceMode,
  language: DisplayLang,
): string {
  const mixedCase = CANONICAL_DISPLAY[canonical] || canonical
  if (audience === 'medical') return mixedCase
  const map = language === 'zh-TW' ? CANONICAL_TO_LAY_ZH : CANONICAL_TO_LAY_EN
  return map[canonical] || mixedCase
}

/**
 * Convenience wrapper: resolves canonical via getAnalyteLabel(obs) and
 * then applies audience/language display logic. Returns the bridge-sent
 * raw text for non-canonical rows (microbiology cultures, antibiotic
 * susceptibilities, free-text reports) so unfamiliar rows keep their
 * source label rather than being mis-translated.
 *
 * Render sites should call THIS instead of getAnalyteLabel directly.
 * Sort / categorise / search / AI-prompt sites should keep using
 * getAnalyteLabel so canonical keys stay stable.
 */
export function getAnalyteDisplayForObs(
  obsOrComponent: { code?: any } | null | undefined,
  audience: AudienceMode,
  language: DisplayLang,
): string {
  const canonical = getAnalyteLabel(obsOrComponent)
  if (!CANONICAL_KEYS.has(canonical)) return canonical
  return getAnalyteDisplayLabel(canonical, audience, language)
}
