// Lab category definitions for cumulative report view.
// Mirrors VGH 累積報告 categories: CBC, 生化, 血糖, 癌症指數, 尿液.

export interface LabCategory {
  id: string
  labelEn: string
  labelZh: string
  /** Test codes or display-name keywords belonging to this category (uppercase, normalized) */
  codes: string[]
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
  },
  {
    id: 'chem',
    labelEn: 'Biochemistry',
    labelZh: '生化檢驗',
    preferredOrder: ['TP', 'ALB', 'BUN', 'CREA', 'CREAT', 'CREAT.', 'EGFR(EPI)', 'EGFR(M)', 'NA', 'K', 'CL', 'CO2', 'CA', 'IP', 'UA', 'CHOL', 'TG', 'HDLC', 'LDLC', 'AST', 'ALT', 'ALK-P', 'ALKP', 'GGT', 'G-GT', 'LDH', 'T.BILI', 'T.BILI.', 'TBILI', 'BILIT', 'D.BILI', 'DBILI', 'CK', 'CKMB', 'TROP', 'IRON', 'TIBC', 'CRP', 'FIB-4'],
    codes: ['TP', 'ALB', 'BUN', 'CREA', 'CREAT', 'CREAT.', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'NA', 'K', 'CL', 'CO2', 'CA', 'CACAL', 'IP', 'UA', 'CHOL', 'TG', 'HDLC', 'LDLC', 'LDL(計算值)', 'RISKF', 'AST', 'ALT', 'ALK-P', 'ALKP', 'GGT', 'G-GT', 'LDH', 'T.BILI', 'T.BILI.', 'TBILI', 'BILIT', 'BILI', 'D.BILI', 'DBILI', 'CK', 'CKMB', 'CKMB(POCT)', 'TROP', 'TROP(POCT)', 'IRON', 'TIBC', 'CRP', 'FIB-4', 'CERULOPLASMIN', 'AMA', 'ASMA', 'ANA'],
  },
  {
    id: 'glucose',
    labelEn: 'Glucose',
    labelZh: '血糖',
    preferredOrder: ['GLUCOSE', 'GLU', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC', 'HBA1C', 'C-PEPTIDE'],
    codes: ['GLUCOSE', 'GLU', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC', 'HBA1C', 'C-PEPTIDE'],
  },
  {
    id: 'tumor',
    labelEn: 'Tumor Markers',
    labelZh: '癌症指數',
    preferredOrder: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'FPSA/PSA', 'FPSA', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'ANTI-HCV', 'PIVKA-II', 'PIVKA'],
    codes: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'FPSA/PSA', 'FPSA', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'ANTI-HCV', 'PIVKA-II', 'PIVKA', 'E2', 'FSH'],
  },
  {
    id: 'urine',
    labelEn: 'Urinalysis',
    labelZh: '尿液檢驗',
    preferredOrder: ['COLOR', 'PH', 'SUGAR', 'TRANS', 'BILI', 'PROT', 'KETON', 'KETONE', 'UROBI', 'GRAVIT', 'NITRIT', 'NITRITE', 'OCCULT', 'WBC', 'RBC', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'],
    codes: ['COLOR', 'TRANS', 'TRANSPARENT', 'GRAVIT', 'GRAVITY', 'UROBI', 'UROBILINOGEN', 'NITRIT', 'NITRITE', 'OCCULT', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'],
  },
]

function normalize(s: string): string {
  return s.trim().toUpperCase()
}

/**
 * Determine which category a lab observation belongs to.
 * Returns null if it doesn't match any defined category.
 *
 * Matching priority:
 * 1. Exact match against code.code (case-insensitive)
 * 2. Exact match against code.text (case-insensitive)
 * 3. For urinalysis, also check specimen.code/text containing "URINE"
 */
export function categorizeObservation(obs: any): LabCategory | null {
  if (!obs) return null

  const code = obs.code?.coding?.[0]?.code ? normalize(obs.code.coding[0].code) : ''
  const text = obs.code?.text ? normalize(obs.code.text) : ''
  const display = obs.code?.coding?.[0]?.display ? normalize(obs.code.coding[0].display) : ''

  const candidates = [code, text, display].filter(Boolean)

  // Special case: urine specimen → urinalysis category
  const specimenText = obs.specimen?.display || obs.category?.[1]?.text
  if (specimenText && /urine|尿/i.test(String(specimenText))) {
    return LAB_CATEGORIES.find((c) => c.id === 'urine') || null
  }

  for (const cat of LAB_CATEGORIES) {
    const codeSet = new Set(cat.codes.map(normalize))
    for (const candidate of candidates) {
      if (codeSet.has(candidate)) return cat
    }
  }
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
