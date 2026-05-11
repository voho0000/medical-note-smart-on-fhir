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
}

export const LAB_CATEGORIES: LabCategory[] = [
  {
    id: 'cbc',
    labelEn: 'CBC',
    labelZh: 'CBC 血液常規',
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
    labelEn: 'Biochemistry',
    labelZh: '生化檢驗',
    preferredOrder: ['BUN', 'CREATININE', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'URIC ACID', 'NA', 'K', 'CL', 'CO2', 'CA', 'IP', 'AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'LDH', 'TP', 'ALB', 'CK', 'CKMB', 'TROP', 'CRP', 'FIB-4', 'IRON', 'TIBC'],
    codes: ['TP', 'ALB', 'BUN', 'CREA', 'CREAT', 'CREAT.', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'NA', 'K', 'CL', 'CO2', 'CA', 'CACAL', 'IP', 'UA', 'AST', 'ALT', 'ALK-P', 'ALKP', 'GGT', 'G-GT', 'LDH', 'T.BILI', 'T.BILI.', 'TBILI', 'BILIT', 'BILI', 'D.BILI', 'DBILI', 'CK', 'CKMB', 'CKMB(POCT)', 'TROP', 'TROP(POCT)', 'IRON', 'TIBC', 'CRP', 'FIB-4'],
    loincCodes: ['2951-2', '2947-0', '2823-3', '6298-4', '2075-0', '2069-3', '3094-0', '6299-2', '2160-0', '38483-4', '33914-3', '48642-3', '48643-1', '62238-1', '69405-9', '77147-7', '1742-6', '1920-8', '6768-6', '2324-2', '14804-9', '1975-2', '1968-7', '1971-1', '2885-2', '1751-7', '17861-6', '2000-8', '49765-1', '2777-1', '14879-1', '3084-1', '1988-5', '14647-2', '30522-7', '2157-6', '13969-1', '6598-7', '10839-9', '49563-0', '2498-4', '2500-7', '14935-1', '1759-0', '2532-0', '11051-0', '2243-4'],
    nameKeywords: ['SODIUM', 'POTASSIUM', 'CHLORIDE', 'BICARBONATE', 'CO2', 'UREA NITROGEN', 'CREATININE', 'GLOMERULAR FILTRATION', 'ALBUMIN', 'TOTAL PROTEIN', 'GLOBULIN', 'BILIRUBIN', 'ASPARTATE AMINOTRANSFERASE', 'ALANINE AMINOTRANSFERASE', 'ALKALINE PHOSPHATASE', 'GAMMA GLUTAMYL', 'GAMMA-GLUTAMYL', 'LACTATE DEHYDROGENASE', 'CALCIUM', 'PHOSPHATE', 'PHOSPHORUS', 'URATE', 'URIC ACID', 'C REACTIVE PROTEIN', 'C-REACTIVE PROTEIN', 'CREATINE KINASE', 'CK-MB', 'TROPONIN', 'IRON', 'TRANSFERRIN', 'FERRITIN'],
    subgroups: [
      { id: 'renal',       labelEn: 'Renal',        labelZh: '腎功能',   members: ['BUN', 'CREATININE', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'URIC ACID'] },
      { id: 'electrolyte', labelEn: 'Electrolytes', labelZh: '電解質',   members: ['NA', 'K', 'CL', 'CO2', 'CA', 'IP'] },
      { id: 'liver',       labelEn: 'Liver',        labelZh: '肝功能',   members: ['AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'LDH', 'TP', 'ALB'] },
      { id: 'cardiac',     labelEn: 'Cardiac',      labelZh: '心肌酵素', members: ['CK', 'CKMB', 'TROP'] },
      { id: 'inflam',      labelEn: 'Inflammation', labelZh: '發炎指數', members: ['CRP', 'FIB-4'] },
      { id: 'iron',        labelEn: 'Iron Studies', labelZh: '鐵代謝',   members: ['IRON', 'TIBC'] },
    ],
  },
  {
    id: 'lipid',
    labelEn: 'Lipid Panel',
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
    preferredOrder: ['GLUCOSE', 'GLU', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC', 'HBA1C', 'C-PEPTIDE'],
    codes: ['GLUCOSE', 'GLU', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC', 'HBA1C', 'HBA1', 'A1C', 'C-PEPTIDE'],
    loincCodes: ['2345-7', '2339-0', '14749-6', '15074-8', '41653-7', '4548-4', '17856-6', '4549-2', '1986-9'],
    nameKeywords: ['GLUCOSE', 'HEMOGLOBIN A1C', 'GLYCATED HEMOGLOBIN', 'GLYCATED HAEMOGLOBIN', 'GLYCOHEMOGLOBIN', 'HBA1C', 'C PEPTIDE', 'C-PEPTIDE'],
  },
  {
    id: 'tumor',
    labelEn: 'Tumor Markers',
    labelZh: '癌症指數',
    preferredOrder: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'FPSA/PSA', 'FPSA', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'ANTI-HCV', 'PIVKA-II', 'PIVKA'],
    codes: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'TPSA', 'T-PSA', 'PSA(T)', 'PSA-T', 'FPSA/PSA', 'FPSA', 'F-PSA', 'PSA-F', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'B-HCG', 'BETA-HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'ANTI-HCV', 'PIVKA-II', 'PIVKA', 'E2', 'FSH'],
    loincCodes: ['1834-1', '2039-6', '10334-1', '24108-3', '2857-1', '10886-0', '24467-3', '47238-1', '83112-3', '19201-2', '53764-7', '15067-2', '15083-9', '47239-9'],
    nameKeywords: ['ALPHA FETO', 'ALPHA-FETO', 'CARCINOEMBRYONIC', 'CA 125', 'CA 15-3', 'CA 15.3', 'CA 19-9', 'PROSTATE SPECIFIC', 'PROSTATE-SPECIFIC ANTIGEN', 'PROSTATE-SPECIFIC AG', 'BETA-2 MICROGLOBULIN', 'BETA 2 MICROGLOBULIN', 'CHORIONIC GONADOTROPIN', 'CALCITONIN', 'CYFRA', 'NEURON SPECIFIC ENOLASE', 'NEURON-SPECIFIC ENOLASE', 'HEPATITIS C VIRUS', 'ANTI-HCV', 'PIVKA', 'SQUAMOUS CELL CARCINOMA ANTIGEN', 'TUMOR MARKER'],
  },
  {
    id: 'urine',
    labelEn: 'Urinalysis',
    labelZh: '尿液檢驗',
    preferredOrder: ['COLOR', 'PH', 'SUGAR', 'TRANS', 'BILI', 'PROT', 'KETON', 'KETONE', 'UROBI', 'GRAVIT', 'NITRIT', 'NITRITE', 'OCCULT', 'WBC', 'RBC', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'],
    codes: ['COLOR', 'TRANS', 'TRANSPARENT', 'GRAVIT', 'GRAVITY', 'UROBI', 'UROBILINOGEN', 'NITRIT', 'NITRITE', 'OCCULT', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'],
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
// always urinalysis tests. Pattern is lenient — allows trailing content like
// "4+ (2000)" or "Negative (mg/dL)" by not anchoring to end-of-string.
const QUALITATIVE_RE = /^(negative|positive|trace|few|occasional|moderate|many|\d?\+|\+{1,4}|none|nil)\b/i

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

  // 4. HbA1c always wins over CBC (text contains "Hemoglobin" but is glucose)
  if (/\bA1C\b|HBA1C|GLYCATED|GLYCOHEMOGLOBIN|GLYCO\s*HAEMOGLOBIN/.test(fullText)) {
    return LAB_CATEGORIES.find((c) => c.id === 'glucose') || null
  }

  // Pass 1: exact short-code match against `codes` (VGH style)
  for (const cat of LAB_CATEGORIES) {
    const codeSet = new Set(cat.codes.map(normalize))
    for (const candidate of exactCandidates) {
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
