// Lab category definitions for cumulative report view.
// Mirrors VGH 累積報告 categories: CBC, 生化, 血糖, 癌症指數, 尿液.
//
// Matching strategy (tried in order):
//  1. Exact match against short codes (`codes`) — handles VGH bridge data
//     (e.g., "ALT", "Na", "ALK-P").
//  2. Exact match against LOINC codes (`loincCodes`) — handles standard
//     HAPI FHIR / sandbox data where only LOINC is filled in `code.code`.
//  3. Substring match against full display text (`nameKeywords`) — handles
//     long English LOINC display names (e.g., "Sodium [Moles/volume] in
//     Serum or Plasma" contains "SODIUM").

export interface LabSubgroup {
  /** Stable id */
  id: string
  labelEn: string
  labelZh: string
  /** Canonical row keys (uppercase) that belong to this subgroup.
   *  Match against pickKey() result in useLabPivot. */
  members: string[]
}

export interface LabCategory {
  id: string
  labelEn: string
  labelZh: string
  /** Short codes / abbreviations (matched against code.code / code.text / coding.display) */
  codes: string[]
  /** Standard LOINC codes (matched against code.coding[].code) */
  loincCodes?: string[]
  /** Substrings to find anywhere in the display text — uppercase */
  nameKeywords?: string[]
  /** Preferred column order — codes appearing here render first in this order */
  preferredOrder?: string[]
  /** Clinically meaningful subgroups within this category (e.g., 腎功能/肝功能) */
  subgroups?: LabSubgroup[]
  /** Test keys that always appear as columns even when the patient has no data for them */
  pinnedColumns?: string[]
}

export const LAB_CATEGORIES: LabCategory[] = [
  {
    id: 'cbc',
    labelEn: 'CBC',
    labelZh: '血液常規',
    preferredOrder: ['WBC', 'RBC', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW', 'RDW-CV', 'PLT', 'MPV', 'BAND', 'SEG', 'NEU', 'NEU.', 'LYM', 'LYM.', 'MONO', 'MONO.', 'EOS', 'EOS.', 'BASO', 'BASO.', 'ANC', 'PT', 'APTT', 'INR', 'D-DIMER', 'FDP', 'FIBRINOGEN'],
    codes: ['WBC', 'RBC', 'HGB', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW', 'RDW-CV', 'PLT', 'MPV', 'BAND', 'SEG', 'NEU', 'NEU.', 'LYM', 'LYM.', 'MONO', 'MONO.', 'EOS', 'EOS.', 'BASO', 'BASO.', 'ANC', 'PT', 'PROTHROMBIN TIME', 'APTT', 'INR', 'D-DIMER', 'FDP', 'FIBRINOGEN'],
    loincCodes: ['6690-2', '26464-8', '789-8', '26453-1', '718-7', '30350-3', '4544-3', '20570-8', '777-3', '26515-7', '787-2', '785-6', '786-4', '788-0', '32623-1', '5902-2', '14979-9', '6301-6', '770-8', '736-9', '731-0', '742-7', '706-2', '751-8', '4544-3', '751-8', '764-1', '32155-4'],
    nameKeywords: ['HEMOGLOBIN', 'HEMATOCRIT', 'LEUKOCYTE', 'ERYTHROCYTE', 'PLATELET', 'MEAN CORPUSCULAR', 'MEAN PLATELET', 'RED CELL DISTRIBUTION', 'NEUTROPHIL', 'LYMPHOCYTE', 'MONOCYTE', 'EOSINOPHIL', 'BASOPHIL', 'BAND CELL', 'PROTHROMBIN TIME', 'PARTIAL THROMBOPLASTIN', 'INR', 'D-DIMER', 'FIBRINOGEN'],
    subgroups: [
      { id: 'counts',    labelEn: 'Counts',        labelZh: '計數', members: ['WBC', 'RBC', 'HB', 'HCT', 'PLT', 'MPV'] },
      { id: 'indices',   labelEn: 'RBC Indices',   labelZh: '紅血球指數', members: ['MCV', 'MCH', 'MCHC', 'RDW', 'RDW-CV'] },
      { id: 'diff',      labelEn: 'Differential',  labelZh: '白血球分類', members: ['SEG', 'NEU', 'NEU.', 'LYM', 'LYM.', 'MONO', 'MONO.', 'EOS', 'EOS.', 'BASO', 'BASO.', 'BAND', 'ANC'] },
      { id: 'coag',      labelEn: 'Coagulation',   labelZh: '凝血', members: ['PT', 'APTT', 'INR', 'D-DIMER', 'FDP', 'FIBRINOGEN'] },
    ],
  },
  {
    id: 'chem',
    labelEn: 'Biochem',
    labelZh: '生化檢驗',
    preferredOrder: ['BUN', 'CREATININE', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'URIC ACID', 'NA', 'K', 'CL', 'CO2', 'CA', 'IP', 'AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'LDH', 'TP', 'ALB', 'CK', 'CKMB', 'TROP', 'CRP', 'FIB-4', 'IRON', 'TIBC'],
    codes: ['TP', 'ALB', 'BUN', 'CREA', 'CREAT', 'CREAT.', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'NA', 'K', 'CL', 'CO2', 'CA', 'CACAL', 'IP', 'UA', 'AST', 'ALT', 'ALK-P', 'ALKP', 'GGT', 'G-GT', 'LDH', 'T.BILI', 'T.BILI.', 'TBILI', 'BILIT', 'BILI', 'D.BILI', 'DBILI', 'CK', 'CKMB', 'CKMB(POCT)', 'TROP', 'TROP(POCT)', 'IRON', 'TIBC', 'CRP', 'FIB-4', 'PCT', 'PROCALCITONIN', 'ESR', 'LACTATE', 'LDH'],
    loincCodes: ['2951-2', '2947-0', '2823-3', '6298-4', '2075-0', '2069-3', '3094-0', '6299-2', '2160-0', '38483-4', '33914-3', '48642-3', '48643-1', '62238-1', '69405-9', '77147-7', '1742-6', '1920-8', '6768-6', '2324-2', '14804-9', '1975-2', '1968-7', '1971-1', '2885-2', '1751-7', '17861-6', '2000-8', '49765-1', '2777-1', '14879-1', '3084-1', '1988-5', '14647-2', '30522-7', '2157-6', '13969-1', '6598-7', '10839-9', '49563-0', '2498-4', '2500-7', '14935-1', '1759-0', '2532-0', '11051-0', '2243-4', '33959-8', '75241-0', '4537-7', '30341-2', '14338-8'],
    nameKeywords: ['SODIUM', 'POTASSIUM', 'CHLORIDE', 'BICARBONATE', 'CO2', 'UREA NITROGEN', 'CREATININE', 'GLOMERULAR FILTRATION', 'ALBUMIN', 'TOTAL PROTEIN', 'GLOBULIN', 'BILIRUBIN', 'ASPARTATE AMINOTRANSFERASE', 'ALANINE AMINOTRANSFERASE', 'ALKALINE PHOSPHATASE', 'GAMMA GLUTAMYL', 'GAMMA-GLUTAMYL', 'LACTATE DEHYDROGENASE', 'CALCIUM', 'PHOSPHATE', 'PHOSPHORUS', 'URATE', 'URIC ACID', 'C REACTIVE PROTEIN', 'C-REACTIVE PROTEIN', 'CREATINE KINASE', 'CK-MB', 'TROPONIN', 'IRON', 'TRANSFERRIN', 'FERRITIN', 'PROCALCITONIN', 'ERYTHROCYTE SEDIMENTATION RATE', 'LACTATE'],
    subgroups: [
      { id: 'renal',       labelEn: 'Renal',        labelZh: '腎功能',   members: ['BUN', 'CREATININE', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'URIC ACID'] },
      { id: 'electrolyte', labelEn: 'Electrolytes', labelZh: '電解質',   members: ['NA', 'K', 'CL', 'CO2', 'CA', 'IP'] },
      { id: 'liver',       labelEn: 'Liver',        labelZh: '肝功能',   members: ['AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'LDH', 'TP', 'ALB'] },
      { id: 'cardiac',     labelEn: 'Cardiac',      labelZh: '心肌酵素', members: ['CK', 'CKMB', 'TROP'] },
      { id: 'inflam',      labelEn: 'Inflammation', labelZh: '發炎/感染', members: ['CRP', 'PROCALCITONIN', 'PCT', 'ESR', 'FIB-4', 'LACTATE'] },
      { id: 'iron',        labelEn: 'Iron Studies', labelZh: '鐵代謝',   members: ['IRON', 'TIBC'] },
    ],
  },
  {
    id: 'endocrine',
    labelEn: 'Endo',
    labelZh: '內分泌',
    preferredOrder: [
      // Thyroid
      'TSH', 'FREE T4', 'FREE T3', 'T4', 'T3', 'FT4', 'FT3', 'RT3', 'ANTI-TPO', 'ANTI-TG', 'THYROGLOBULIN',
      // Parathyroid / Bone
      'PTH', 'VITAMIN D', '25-OH VITAMIN D', 'CALCITONIN',
      // Adrenal
      'CORTISOL', 'ACTH', 'ALDOSTERONE', 'RENIN', 'DHEA-S',
      // Sex hormones
      'LH', 'FSH', 'E2', 'ESTRADIOL', 'PROGESTERONE', 'TESTOSTERONE', 'PROLACTIN', 'AMH', 'SHBG',
      // Diabetes
      'INSULIN', 'C-PEPTIDE',
      // Growth
      'GH', 'IGF-1',
    ],
    codes: [
      // Thyroid
      'TSH', 'T3', 'T4', 'FT3', 'FT4', 'FREE T3', 'FREE T4', 'FREE-T3', 'FREE-T4', 'RT3', 'REVERSE T3',
      'ANTI-TPO', 'ANTI-TG', 'THYROGLOBULIN', 'TRAB', 'TBII',
      // Parathyroid / Bone
      'PTH', 'I-PTH', 'INTACT PTH', 'VITAMIN D', '25-OH-D', '25(OH)D', '25-OH VITAMIN D',
      // Adrenal
      'CORTISOL', 'ACTH', 'ALDOSTERONE', 'RENIN', 'PRA', 'DHEA', 'DHEA-S', 'DHEAS',
      // Sex hormones
      'LH', 'FSH', 'E2', 'ESTRADIOL', 'PROGESTERONE', 'TESTOSTERONE', 'FREE TESTOSTERONE',
      'PROLACTIN', 'PRL', 'AMH', 'SHBG',
      // Diabetes / Pancreas
      'INSULIN', 'C-PEPTIDE',
      // Growth / Pituitary
      'GH', 'IGF-1', 'IGF1',
    ],
    loincCodes: [
      // Thyroid: TSH, T4, T3, FT4, FT3
      '3016-3', '11580-8', '14999-7', '3024-7', '3026-2', '3051-0', '14920-3', '14998-9',
      // Anti-TPO, Anti-Tg, Thyroglobulin
      '8099-6', '8100-2', '11572-5',
      // PTH (intact), Calcium-regulating
      '2731-8', '14866-8',
      // Vitamin D
      '1989-3', '14635-7', '62292-8', '49054-0',
      // Cortisol, ACTH
      '2143-6', '2141-0',
      // Sex hormones
      '2986-8', '2243-4', '15067-2', '15083-9', '2839-9', '2842-3', '2243-4',
      // E2, FSH, LH, Progesterone, Testosterone, Prolactin
      '2243-4', '15067-2', '10501-5', '2991-8', '2986-8', '2842-3',
      // Insulin, C-Peptide
      '20448-7', '1986-9',
      // IGF-1, GH
      '2484-4', '2963-7',
    ],
    nameKeywords: [
      'THYROID', 'THYROTROPIN', 'THYROXINE', 'TRIIODOTHYRONINE', 'THYROGLOBULIN', 'ANTI-THYROID',
      '游離甲狀腺素', '甲促素', '三碘甲狀腺素', '游離三碘甲狀腺',
      'PARATHYROID HORMONE', 'PARATHYROID',
      'VITAMIN D', '25-HYDROXY',
      'CORTISOL', 'CORTICOTROPIN', 'ALDOSTERONE',
      'ESTRADIOL', 'PROGESTERONE', 'TESTOSTERONE', 'PROLACTIN',
      'FOLLICLE STIMULATING', 'LUTEINIZING', 'CHORIONIC GONADOTROP',
      'INSULIN', 'C-PEPTIDE', 'C PEPTIDE',
      'GROWTH HORMONE', 'INSULIN-LIKE GROWTH', 'INSULIN LIKE GROWTH', 'SOMATOMEDIN',
      'DEHYDROEPIANDROSTERONE', 'DHEA',
      'ANTI-MULLERIAN', 'SEX HORMONE BINDING',
    ],
    subgroups: [
      { id: 'thyroid',  labelEn: 'Thyroid',       labelZh: '甲狀腺',   members: ['TSH', 'FREE T4', 'FREE T3', 'T4', 'T3', 'FT4', 'FT3', 'RT3', 'REVERSE T3', 'ANTI-TPO', 'ANTI-TG', 'THYROGLOBULIN', 'TRAB', 'TBII'] },
      { id: 'parathy',  labelEn: 'Parathyroid',   labelZh: '副甲狀腺', members: ['PTH', 'I-PTH', 'INTACT PTH', 'VITAMIN D', '25-OH-D', '25(OH)D', '25-OH VITAMIN D', 'CALCITONIN'] },
      { id: 'adrenal',  labelEn: 'Adrenal',       labelZh: '腎上腺',   members: ['CORTISOL', 'ACTH', 'ALDOSTERONE', 'RENIN', 'PRA', 'DHEA', 'DHEA-S', 'DHEAS'] },
      { id: 'sexhorm',  labelEn: 'Sex Hormones',  labelZh: '性荷爾蒙', members: ['LH', 'FSH', 'E2', 'ESTRADIOL', 'PROGESTERONE', 'TESTOSTERONE', 'FREE TESTOSTERONE', 'PROLACTIN', 'PRL', 'AMH', 'SHBG'] },
      { id: 'pancreas', labelEn: 'Pancreas',      labelZh: '胰島',     members: ['INSULIN', 'C-PEPTIDE'] },
      { id: 'pituitary',labelEn: 'Pituitary/GH',  labelZh: '生長激素', members: ['GH', 'IGF-1', 'IGF1'] },
    ],
    pinnedColumns: ['TSH', 'FREE T4', 'CORTISOL'],
  },
  {
    id: 'lipid',
    labelEn: 'Lipids',
    labelZh: '血脂',
    preferredOrder: ['CHOL', 'TG', 'HDL', 'LDL', 'LDL(計算值)', 'RISKF', 'VLDL', 'NON-HDL', 'APO-A1', 'APO-B', 'LP(A)'],
    codes: ['CHOL', 'CHOL.', 'CHOLESTEROL', 'TG', 'TRIG', 'TRIGLYCERIDE', 'HDLC', 'HDL', 'HDL-C', 'HDLC.', 'LDLC', 'LDL', 'LDL-C', 'LDLC.', 'LDL(計算值)', 'RISKF', 'VLDL', 'VLDLC', 'VLDL-C', 'NON-HDLC', 'NON-HDL', 'NON-HDL-C', 'APO-A', 'APO-A1', 'APOA1', 'APO-B', 'APOB', 'LP(A)'],
    loincCodes: ['2093-3', '14647-2', '14646-4', '2571-8', '3043-7', '2085-9', '2086-7', '14646-4', '2089-1', '13457-7', '2090-9', '13457-7', '43396-1', '13458-5', '11054-4', '2089-1', '13457-7', '18261-8', '18262-6', '10835-7'],
    nameKeywords: ['CHOLESTEROL', 'TRIGLYCERIDE', 'HDL', 'LDL', 'VLDL', 'NON-HDL', 'LIPID', 'HIGH DENSITY LIPOPROTEIN', 'LOW DENSITY LIPOPROTEIN', 'APOLIPOPROTEIN', 'APO A', 'APO B', 'LIPOPROTEIN(A)'],
  },
  {
    id: 'glucose',
    labelEn: 'Glucose',
    labelZh: '血糖',
    preferredOrder: ['GLUCOSE', 'GLU', 'GLU-AC', 'SUGAR', 'FINGER SUGAR', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC', 'HBA1C', 'C-PEPTIDE'],
    // SUGAR / FINGER SUGAR: some Taiwan clinics use these for blood glucose.
    // Urine dipstick "Sugar" with qualitative value (+, ++, 4+, negative)
    // is routed to urine via the qualitative-value heuristic earlier.
    codes: ['GLUCOSE', 'GLU', 'GLU-AC', 'GLU(AC)', 'GLUCOSE(AC)', 'GLUCOSE AC', 'SUGAR', 'FINGER SUGAR', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC', 'HBA1C', 'HBA1', 'A1C', 'HB-A1C', 'C-PEPTIDE'],
    loincCodes: ['2345-7', '2339-0', '14749-6', '15074-8', '41653-7', '4548-4', '17856-6', '4549-2', '1986-9'],
    nameKeywords: ['GLUCOSE', 'HEMOGLOBIN A1C', 'GLYCATED HEMOGLOBIN', 'GLYCATED HAEMOGLOBIN', 'GLYCOHEMOGLOBIN', 'HBA1C', 'C PEPTIDE', 'C-PEPTIDE'],
  },
  {
    id: 'tumor',
    labelEn: 'Tumor',
    labelZh: '癌症指數',
    preferredOrder: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'FPSA/PSA', 'FPSA', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'ANTI-HCV', 'PIVKA-II', 'PIVKA'],
    codes: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'TPSA', 'T-PSA', 'PSA(T)', 'PSA-T', 'FPSA/PSA', 'FPSA', 'F-PSA', 'PSA-F', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'B-HCG', 'BETA-HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'ANTI-HCV', 'PIVKA-II', 'PIVKA'],
    loincCodes: ['1834-1', '2039-6', '10334-1', '24108-3', '2857-1', '10886-0', '24467-3', '47238-1', '83112-3', '19201-2', '53764-7', '15067-2', '15083-9', '47239-9'],
    nameKeywords: ['ALPHA FETO', 'ALPHA-FETO', 'CARCINOEMBRYONIC', 'CA 125', 'CA 15-3', 'CA 15.3', 'CA 19-9', 'PROSTATE SPECIFIC', 'PROSTATE-SPECIFIC ANTIGEN', 'PROSTATE-SPECIFIC AG', 'BETA-2 MICROGLOBULIN', 'BETA 2 MICROGLOBULIN', 'CHORIONIC GONADOTROPIN', 'CALCITONIN', 'CYFRA', 'NEURON SPECIFIC ENOLASE', 'NEURON-SPECIFIC ENOLASE', 'HEPATITIS C VIRUS', 'ANTI-HCV', 'PIVKA', 'SQUAMOUS CELL CARCINOMA ANTIGEN', 'TUMOR MARKER'],
  },
  {
    id: 'urine',
    labelEn: 'Urine',
    labelZh: '尿液檢驗',
    preferredOrder: ['COLOR', 'PH', 'SUGAR', 'TRANS', 'BILI', 'PROT', 'KETON', 'KETONE', 'UROBI', 'GRAVIT', 'NITRIT', 'NITRITE', 'OCCULT', 'WBC', 'RBC', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'],
    // Note: SUGAR is NOT in urine codes — some clinics report blood glucose as
    // "Sugar". Urine dipstick sugar is detected via the qualitative-value
    // heuristic (Negative/+/++/etc.) earlier in categorizeObservation.
    codes: ['COLOR', 'TRANS', 'TRANSPARENT', 'TURBIDITY', 'APPEARANCE', 'GRAVIT', 'GRAVITY', 'SP.GRAVITY', 'PROTEIN', 'PROT', 'KETON', 'KETONE', 'UROBI', 'UROBILINOGEN', 'NITRIT', 'NITRITE', 'OCCULT', 'OCCULT BLOOD', 'BLOOD', 'EPITH', 'EPITH CELL', 'EPITHELIAL CELL', 'WBCPUS', 'WBC/HPF', 'RBC/HPF', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'CASTS', 'CRYSTAL', 'BACTERIA', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO', 'ACR', 'UACR', 'MALB', 'MALB(U)'],
    loincCodes: ['5778-6', '5803-2', '5774-5', '5767-9', '5797-6', '5804-0', '5802-4', '5794-3', '5811-5', '5799-2', '20454-5', '5821-4', '5808-1'],
    nameKeywords: ['URINALYSIS', 'URINE COLOR', 'URINE APPEARANCE', 'SPECIFIC GRAVITY', 'UROBILINOGEN', 'NITRITE', 'KETONE', 'OCCULT BLOOD', 'EPITHELIAL CELL', 'BACTERIA', 'CASTS', 'CRYSTAL', 'SQUAMOUS EPITHELIAL'],
    subgroups: [
      { id: 'physical',  labelEn: 'Physical',   labelZh: '物理性狀', members: ['COLOR', 'TRANS', 'TRANSPARENT', 'GRAVIT', 'GRAVITY', 'PH'] },
      { id: 'chemical',  labelEn: 'Chemistry',  labelZh: '化學分析', members: ['SUGAR', 'GLUCOSE', 'PROT', 'PROTEIN', 'KETON', 'KETONE', 'T.BILI', 'BILIRUBIN', 'UROBI', 'UROBILINOGEN', 'NITRIT', 'NITRITE', 'OCCULT', 'BLOOD'] },
      { id: 'micro',     labelEn: 'Microscopy', labelZh: '顯微鏡檢', members: ['WBC', 'RBC', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3'] },
      { id: 'ratio',     labelEn: 'Spot Ratios', labelZh: '尿蛋白/肌酸酐比值', members: ['PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'] },
    ],
  },
]

function normalize(s: string): string {
  return s.trim().toUpperCase()
}

/**
 * Determine which category a lab observation belongs to.
 * Returns null if it doesn't match any defined category.
 *
 * Looks at ALL coding entries (not just [0]) since HAPI / SMART sandbox often
 * fills LOINC in coding[1] with a local code in coding[0].
 *
 * Keyword matching picks the LONGEST match across all categories so specific
 * keywords win generic ones (e.g., "HEMOGLOBIN A1C" → glucose beats
 * "HEMOGLOBIN" → cbc).
 */
// Qualitative dipstick results (Negative/Positive/Trace/+1...) are almost
// always urinalysis tests. Pattern allows trailing content like "4+ (2000)".
// Uses (?!\w) instead of \b so "4+" and "3+" match ('+' is non-word, has no \b).
const QUALITATIVE_RE = /^(negative|positive|trace|few|occasional|moderate|many|\d?\+|\+{1,4}|none|nil)(?!\w)/i

function isQualitativeResult(obs: any): boolean {
  if (obs.valueQuantity?.value !== undefined && obs.valueQuantity?.value !== null) return false
  const v = String(obs.valueString || obs.valueCodeableConcept?.text || '').trim()
  return !!v && QUALITATIVE_RE.test(v)
}

export function categorizeObservation(obs: any): LabCategory | null {
  if (!obs) return null

  const codings: any[] = Array.isArray(obs.code?.coding) ? obs.code.coding : []
  const codeNorms = codings.map((c: any) => (c?.code ? normalize(c.code) : '')).filter(Boolean)
  const displayNorms = codings.map((c: any) => (c?.display ? normalize(c.display) : '')).filter(Boolean)
  const textNorm = obs.code?.text ? normalize(obs.code.text) : ''

  const exactCandidates = [...codeNorms, textNorm, ...displayNorms].filter(Boolean)
  const fullText = [textNorm, ...displayNorms].filter(Boolean).join(' ')

  // ── Early special cases ──────────────────────────────────────────────────
  // 1. FHIR specimen-based routing
  // EHR-FHIR-Bridge now infers specimen from order name (尿/糞/CSF/胸水...).
  // Use it as the most authoritative source.
  const specimenText = String(obs.specimen?.display || obs.category?.[1]?.text || '')
  if (specimenText) {
    if (/urine|urinaly|尿/i.test(specimenText)) {
      return LAB_CATEGORIES.find((c) => c.id === 'urine') || null
    }
    // Non-blood/serum/plasma specimens (stool, sputum, CSF, pleural fluid,
    // ascites, smear, synovial fluid, amniotic, bone marrow…) — these aren't
    // covered by our 5 cumulative-report categories. Skip rather than
    // miscategorize them as blood chem/glucose/tumor.
    if (!/blood|serum|plasma|whole\s*blood|venous|capillary|血/i.test(specimenText)) {
      return null
    }
  }

  // 2. Text mentions urine (LOINC long names like "Glucose [Presence] in Urine")
  if (/\bURINE\b|尿/.test(fullText)) {
    return LAB_CATEGORIES.find((c) => c.id === 'urine') || null
  }

  // 3. Qualitative dipstick values → urinalysis (handles "Bilirubin: negative",
  //    "Glucose 4+ (2000)", "Protein: trace", etc.)
  if (isQualitativeResult(obs)) {
    return LAB_CATEGORIES.find((c) => c.id === 'urine') || null
  }

  // 4. HbA1c always wins over CBC (text contains "Hb" but is glucose)
  //    Use lenient pattern: A1C with optional separator, HBA1C, Hb-A1c, etc.
  if (/A1C|HBA1C|HB\s*A1C|HB-A1C|GLYCATED|GLYCOHEMOGLOBIN|GLYCO\s*HAEMOGLOBIN/i.test(fullText)) {
    return LAB_CATEGORIES.find((c) => c.id === 'glucose') || null
  }

  // 5. Serology / virology / autoimmune markers — not part of routine
  //    cumulative report categories. Skip rather than miscategorize as CBC
  //    (e.g., "HBs Ag" was being matched into CBC via "HB" overlap).
  if (/\bHBS\s*AG\b|\bHBC\s*AG\b|\bHBE\s*AG\b|\bHBE\s*AB\b|ANTI[-\s]?HBS|ANTI[-\s]?HBC|ANTI[-\s]?HBE|ANTI[-\s]?HAV|ANTI[-\s]?HIV|\bHIV\b|\bVDRL\b|\bRPR\b|SYPHILIS|RHEUMATOID FACTOR|\bRF\b/i.test(fullText)) {
    return null
  }

  // 6. Antibiotic susceptibility / MIC results — categorical S/I/R values,
  //    not meaningful as cumulative numeric trends.
  const ANTIBIOTIC_RE = new RegExp(
    [
      // Fluoroquinolones
      'CIPROFLOXACIN', 'LEVOFLOXACIN', 'MOXIFLOXACIN', 'OFLOXACIN', 'NORFLOXACIN',
      // Carbapenems
      'ERTAPENEM', 'IMIPENEM', 'MEROPENEM', 'DORIPENEM',
      // Aminoglycosides
      'GENTAMICIN', 'TOBRAMYCIN', 'AMIKACIN', 'NETILMICIN',
      // Beta-lactams & combos
      'PIPERACILLIN', 'TAZOBACTAM', 'AMPICILLIN', 'AMOXICILLIN',
      'CEFTRIAXONE', 'CEFTAZIDIME', 'CEFEPIME', 'CEFAZOLIN', 'CEFUROXIME',
      'FLOMOXEF', 'OXACILLIN', 'NAFCILLIN', 'METHICILLIN',
      // Other antibiotics
      'TIGECYCLINE', 'COLISTIN', 'POLYMYXIN', 'VANCOMYCIN', 'TEICOPLANIN',
      'LINEZOLID', 'DAPTOMYCIN', 'RIFAMPIN', 'RIFAMPICIN',
      'TRIMETHOPRIM', 'SULFAMETHOXAZOLE', 'CLINDAMYCIN', 'ERYTHROMYCIN',
      'AZITHROMYCIN', 'CLARITHROMYCIN', 'TETRACYCLINE', 'DOXYCYCLINE', 'MINOCYCLINE',
      'CHLORAMPHENICOL', 'NITROFURANTOIN', 'FOSFOMYCIN',
      // Antifungals
      'FLUCONAZOLE', 'VORICONAZOLE', 'ITRACONAZOLE', 'AMPHOTERICIN',
      // Misc tests not suitable for cumulative pivot
      'RIVALTA',                                            // Peritoneal fluid protein test
      'MINIMUM INHIBITORY', '\\bMIC\\b',                   // MIC values
    ].join('|'),
    'i'
  )
  if (ANTIBIOTIC_RE.test(fullText)) {
    return null
  }

  // 7. Specialized / less-common tests — exclude from cumulative report.
  //    These are still visible in the 全部/檢驗 tabs, just hidden from the
  //    pivot view. Add more entries here as users request.
  const SPECIALIZED_RE = new RegExp(
    [
      '\\bTIBC\\b',                                        // Iron binding capacity (rarely tracked over time)
      'MICRO[-\\s]*ALBUMIN', 'MICROALBUMIN',                 // Microalbuminuria (kidney early marker)
      '\\bPCO2\\b', '\\bTCO2\\b', '\\bPO2\\b', '\\bSO2\\b',  // ABG components
      'BASE\\s*EXCESS', '\\bHCO3\\b',                      // ABG components
      'ALTERNARIA', 'ALLERGEN', '过敏原|過敏原',            // Allergen panels
      '(?:α|β|γ|ALPHA|BETA|GAMMA)\\s*[12]?\\s*[-]?\\s*GLOBULIN',  // Protein electrophoresis
      'ELECTROPHORESIS', '蛋白\\s*電泳',
    ].join('|'),
    'i'
  )
  if (SPECIALIZED_RE.test(fullText)) {
    return null
  }

  // Pass 1: exact short-code match against `codes` (VGH style)
  for (const cat of LAB_CATEGORIES) {
    const codeSet = new Set(cat.codes.map(normalize))
    for (const candidate of exactCandidates) {
      if (codeSet.has(candidate)) return cat
    }
  }

  // Pass 1.5: stripped display-name match — handles verbose names like
  // "Serum TSH(ECLIA ...)" where stripping the prefix/parenthetical yields
  // a short code ("TSH") that IS in codes[].
  const strippedDisplays = [textNorm, ...displayNorms]
    .map(n =>
      n.replace(/\s*[\(\[（［].*$/, '')  // strip parenthetical and everything after
       .replace(/^SERUM\s+/, '')          // strip "Serum " / "SERUM " prefix
       .replace(/[.…]+$/, '')             // strip trailing dots
       .trim()
    )
    .filter(Boolean)
  for (const cat of LAB_CATEGORIES) {
    const codeSet = new Set(cat.codes.map(normalize))
    for (const candidate of strippedDisplays) {
      if (codeSet.has(candidate)) return cat
    }
  }

  // Pass 2: exact LOINC match against any coding entry
  for (const cat of LAB_CATEGORIES) {
    if (!cat.loincCodes) continue
    const loincSet = new Set(cat.loincCodes.map(normalize))
    for (const cand of codeNorms) {
      if (loincSet.has(cand)) return cat
    }
  }

  // Pass 3: longest substring keyword match across all categories
  let best: { cat: LabCategory; len: number } | null = null
  for (const cat of LAB_CATEGORIES) {
    if (!cat.nameKeywords) continue
    for (const kw of cat.nameKeywords) {
      const k = normalize(kw)
      if (fullText.includes(k) && (!best || k.length > best.len)) {
        best = { cat, len: k.length }
      }
    }
  }
  if (best) return best.cat

  return null
}

/**
 * Return the display name to show as the test column header.
 */
export function getTestDisplayName(obs: any): string {
  return (
    obs?.code?.text ||
    obs?.code?.coding?.[0]?.display ||
    obs?.code?.coding?.[0]?.code ||
    'Unknown'
  )
}

/**
 * Sort comparator using a category's preferredOrder, with fallback to alphabetical.
 */
export function compareTestsByPreferred(category: LabCategory): (a: string, b: string) => number {
  const order = (category.preferredOrder || []).map(normalize)
  return (a: string, b: string) => {
    const ai = order.indexOf(normalize(a))
    const bi = order.indexOf(normalize(b))
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  }
}
