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
}

export const LAB_CATEGORIES: LabCategory[] = [
  {
    id: 'cbc',
    labelEn: 'CBC',
    labelZh: 'CBC 血液常規',
    preferredOrder: ['WBC', 'RBC', 'HGB', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW', 'RDW-CV', 'PLT', 'MPV', 'BAND', 'SEG', 'NEU', 'NEU.', 'LYM', 'LYM.', 'MONO', 'MONO.', 'EOS', 'EOS.', 'BASO', 'BASO.', 'ANC', 'PT', 'APTT', 'INR', 'D-DIMER', 'FDP', 'FIBRINOGEN'],
    codes: ['WBC', 'RBC', 'HGB', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW', 'RDW-CV', 'PLT', 'MPV', 'BAND', 'SEG', 'NEU', 'NEU.', 'LYM', 'LYM.', 'MONO', 'MONO.', 'EOS', 'EOS.', 'BASO', 'BASO.', 'ANC', 'PT', 'PROTHROMBIN TIME', 'APTT', 'INR', 'D-DIMER', 'FDP', 'FIBRINOGEN'],
    loincCodes: ['6690-2', '26464-8', '789-8', '26453-1', '718-7', '30350-3', '4544-3', '20570-8', '777-3', '26515-7', '787-2', '785-6', '786-4', '788-0', '32623-1', '5902-2', '14979-9', '6301-6', '770-8', '736-9', '731-0', '742-7', '706-2', '751-8', '4544-3', '751-8', '764-1', '32155-4'],
    nameKeywords: ['HEMOGLOBIN', 'HEMATOCRIT', 'LEUKOCYTE', 'ERYTHROCYTE', 'PLATELET', 'MEAN CORPUSCULAR', 'MEAN PLATELET', 'RED CELL DISTRIBUTION', 'NEUTROPHIL', 'LYMPHOCYTE', 'MONOCYTE', 'EOSINOPHIL', 'BASOPHIL', 'BAND CELL', 'PROTHROMBIN TIME', 'PARTIAL THROMBOPLASTIN', 'INR', 'D-DIMER', 'FIBRINOGEN'],
  },
  {
    id: 'chem',
    labelEn: 'Biochemistry',
    labelZh: '生化檢驗',
    preferredOrder: ['TP', 'ALB', 'BUN', 'CREA', 'CREAT', 'CREAT.', 'EGFR(EPI)', 'EGFR(M)', 'NA', 'K', 'CL', 'CO2', 'CA', 'IP', 'UA', 'AST', 'ALT', 'ALK-P', 'ALKP', 'GGT', 'G-GT', 'LDH', 'T.BILI', 'T.BILI.', 'TBILI', 'BILIT', 'D.BILI', 'DBILI', 'CK', 'CKMB', 'TROP', 'IRON', 'TIBC', 'CRP', 'FIB-4'],
    codes: ['TP', 'ALB', 'BUN', 'CREA', 'CREAT', 'CREAT.', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'NA', 'K', 'CL', 'CO2', 'CA', 'CACAL', 'IP', 'UA', 'AST', 'ALT', 'ALK-P', 'ALKP', 'GGT', 'G-GT', 'LDH', 'T.BILI', 'T.BILI.', 'TBILI', 'BILIT', 'BILI', 'D.BILI', 'DBILI', 'CK', 'CKMB', 'CKMB(POCT)', 'TROP', 'TROP(POCT)', 'IRON', 'TIBC', 'CRP', 'FIB-4'],
    loincCodes: ['2951-2', '2947-0', '2823-3', '6298-4', '2075-0', '2069-3', '3094-0', '6299-2', '2160-0', '38483-4', '33914-3', '48642-3', '48643-1', '62238-1', '69405-9', '77147-7', '1742-6', '1920-8', '6768-6', '2324-2', '14804-9', '1975-2', '1968-7', '1971-1', '2885-2', '1751-7', '17861-6', '2000-8', '49765-1', '2777-1', '14879-1', '3084-1', '1988-5', '14647-2', '30522-7', '2157-6', '13969-1', '6598-7', '10839-9', '49563-0', '2498-4', '2500-7', '14935-1', '1759-0', '2532-0', '11051-0', '2243-4'],
    nameKeywords: ['SODIUM', 'POTASSIUM', 'CHLORIDE', 'BICARBONATE', 'CO2', 'UREA NITROGEN', 'CREATININE', 'GLOMERULAR FILTRATION', 'ALBUMIN', 'TOTAL PROTEIN', 'GLOBULIN', 'BILIRUBIN', 'ASPARTATE AMINOTRANSFERASE', 'ALANINE AMINOTRANSFERASE', 'ALKALINE PHOSPHATASE', 'GAMMA GLUTAMYL', 'GAMMA-GLUTAMYL', 'LACTATE DEHYDROGENASE', 'CALCIUM', 'PHOSPHATE', 'PHOSPHORUS', 'URATE', 'URIC ACID', 'C REACTIVE PROTEIN', 'C-REACTIVE PROTEIN', 'CREATINE KINASE', 'CK-MB', 'TROPONIN', 'IRON', 'TRANSFERRIN', 'FERRITIN'],
  },
  {
    id: 'lipid',
    labelEn: 'Lipid Panel',
    labelZh: '血脂',
    preferredOrder: ['CHOL', 'TG', 'HDLC', 'LDLC', 'LDL(計算值)', 'RISKF', 'VLDLC', 'NON-HDLC'],
    codes: ['CHOL', 'CHOL.', 'CHOLESTEROL', 'TG', 'TRIG', 'HDLC', 'HDL', 'LDLC', 'LDL', 'LDL(計算值)', 'RISKF', 'VLDL', 'VLDLC', 'NON-HDLC'],
    loincCodes: ['2093-3', '14647-2', '14646-4', '2571-8', '3043-7', '2085-9', '2086-7', '14646-4', '2089-1', '13457-7', '2090-9', '13457-7', '43396-1', '13458-5', '11054-4', '2089-1'],
    nameKeywords: ['CHOLESTEROL', 'TRIGLYCERIDE', 'HDL CHOLESTEROL', 'LDL CHOLESTEROL', 'VLDL', 'NON-HDL', 'LIPID', 'HIGH DENSITY LIPOPROTEIN', 'LOW DENSITY LIPOPROTEIN'],
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
    codes: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'FPSA/PSA', 'FPSA', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'ANTI-HCV', 'PIVKA-II', 'PIVKA', 'E2', 'FSH'],
    loincCodes: ['1834-1', '2039-6', '10334-1', '24108-3', '2857-1', '10886-0', '24467-3', '47238-1'],
    nameKeywords: ['ALPHA FETO', 'ALPHA-FETO', 'CARCINOEMBRYONIC', 'CA 125', 'CA 15-3', 'CA 15.3', 'CA 19-9', 'PROSTATE SPECIFIC', 'PROSTATE-SPECIFIC ANTIGEN', 'BETA-2 MICROGLOBULIN', 'BETA 2 MICROGLOBULIN', 'CHORIONIC GONADOTROPIN', 'CALCITONIN', 'CYFRA', 'NEURON SPECIFIC ENOLASE', 'NEURON-SPECIFIC ENOLASE', 'HEPATITIS C VIRUS', 'ANTI-HCV', 'PIVKA', 'SQUAMOUS CELL CARCINOMA ANTIGEN'],
  },
  {
    id: 'urine',
    labelEn: 'Urinalysis',
    labelZh: '尿液檢驗',
    preferredOrder: ['COLOR', 'PH', 'SUGAR', 'TRANS', 'BILI', 'PROT', 'KETON', 'KETONE', 'UROBI', 'GRAVIT', 'NITRIT', 'NITRITE', 'OCCULT', 'WBC', 'RBC', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'],
    codes: ['COLOR', 'TRANS', 'TRANSPARENT', 'GRAVIT', 'GRAVITY', 'UROBI', 'UROBILINOGEN', 'NITRIT', 'NITRITE', 'OCCULT', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'],
    loincCodes: ['5778-6', '5803-2', '5774-5', '5767-9', '5797-6', '5804-0', '5802-4', '5794-3', '5811-5', '5799-2', '20454-5', '5821-4', '5808-1'],
    nameKeywords: ['URINALYSIS', 'URINE COLOR', 'URINE APPEARANCE', 'SPECIFIC GRAVITY', 'UROBILINOGEN', 'NITRITE', 'KETONE', 'OCCULT BLOOD', 'EPITHELIAL CELL', 'BACTERIA', 'CASTS', 'CRYSTAL', 'SQUAMOUS EPITHELIAL'],
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
export function categorizeObservation(obs: any): LabCategory | null {
  if (!obs) return null

  const codings: any[] = Array.isArray(obs.code?.coding) ? obs.code.coding : []
  const codeNorms = codings.map((c: any) => (c?.code ? normalize(c.code) : '')).filter(Boolean)
  const displayNorms = codings.map((c: any) => (c?.display ? normalize(c.display) : '')).filter(Boolean)
  const textNorm = obs.code?.text ? normalize(obs.code.text) : ''

  const exactCandidates = [...codeNorms, textNorm, ...displayNorms].filter(Boolean)
  const fullText = [textNorm, ...displayNorms].filter(Boolean).join(' ')

  // Special case: urine specimen → urinalysis category
  const specimenText = obs.specimen?.display || obs.category?.[1]?.text
  if (specimenText && /urine|尿/i.test(String(specimenText))) {
    return LAB_CATEGORIES.find((c) => c.id === 'urine') || null
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
