// Lab category definitions for cumulative report view.
// Mirrors VGH 累積報告 categories: CBC, 生化, 血糖, 癌症指數, 尿液.
//
// Matching strategy — pure allowlist, tried in order:
//  1. Exact match against short codes (`codes`) — handles VGH/NHI bridge data
//     (e.g., "ALT", "Na", "ALK-P").
//  2. Stripped display-name match — strips parentheticals / "Serum" prefix
//     then checks against `codes` (e.g., "Serum TSH(ECLIA)" → "TSH").
//  3. Exact match against LOINC codes (`loincCodes`).
//  Anything not matched by these three passes is excluded from the pivot.
//  No denylist / exclusion regex needed — unrecognised tests simply fall
//  through to `return null`.

export interface LabSubgroup {
  /** Stable id — matches a key under t.reports.cumulativeSubgroups for display. */
  id: string
  /** Canonical row keys (uppercase) that belong to this subgroup.
   *  Match against pickKey() result in useLabPivot. */
  members: string[]
}

export interface LabCategory {
  /** Stable id — matches a key under t.reports.cumulativeCategories for display. */
  id: string
  /** Short codes / abbreviations (matched against code.code / code.text / coding.display) */
  codes: string[]
  /** Standard LOINC codes (matched against code.coding[].code) */
  loincCodes?: string[]
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
    preferredOrder: ['WBC', 'RBC', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW', 'RDW-CV', 'PLT', 'MPV', 'BAND', 'SEG', 'NEU', 'NEU.', 'LYM', 'LYM.', 'MONO', 'MONO.', 'EOS', 'EOS.', 'BASO', 'BASO.', 'ANC'],
    // `codes` covers VGH short-form (WBC/RBC/…) AND long-form display
    // names (BASOPHIL/EOSINOPHIL/…) that bridge v0.9.9+ emits for the
    // differential cells. Long-form catches cases where the LOINC isn't
    // in `loincCodes` so categorisation doesn't depend solely on LOINC
    // accuracy.
    codes: ['WBC', 'RBC', 'HGB', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW', 'RDW-CV', 'PLT', 'MPV', 'BAND', 'SEG', 'SEGMENT', 'NEU', 'NEU.', 'NEUTROPHIL', 'LYM', 'LYM.', 'LYMPHOCYTE', 'MONO', 'MONO.', 'MONOCYTE', 'EOS', 'EOS.', 'EOSINOPHIL', 'BASO', 'BASO.', 'BASOPHIL', 'ANC'],
    // Differential percent LOINCs added 2026-05-27: bridge v0.9.9 emits
    //   713-8  for Eosinophils/100 leukocytes
    //   5905-5 for Monocytes/100 leukocytes
    // and the (semantically wrong) panel LOINC 57021-8 for Segment.
    // Without these in the allowlist, those obs were silently dropped
    // from the cbc category — clinicians saw 累積報告 missing 3 of 5
    // differential cells.
    loincCodes: ['6690-2', '26464-8', '789-8', '26453-1', '718-7', '30350-3', '4544-3', '20570-8', '777-3', '26515-7', '787-2', '785-6', '786-4', '788-0', '32623-1', '770-8', '736-9', '731-0', '742-7', '706-2', '751-8', '4544-3', '751-8', '764-1', '32155-4', '713-8', '5905-5', '57021-8'],
    subgroups: [
      { id: 'counts',  members: ['WBC', 'RBC', 'HB', 'PLT', 'MPV'] },
      { id: 'diff',    members: ['SEG', 'NEU', 'NEU.', 'LYM', 'LYM.', 'MONO', 'MONO.', 'EOS', 'EOS.', 'BASO', 'BASO.', 'BAND', 'ANC'] },
      { id: 'indices', members: ['HCT', 'MCV', 'MCH', 'MCHC', 'RDW', 'RDW-CV'] },
    ],
    pinnedColumns: ['WBC', 'RBC', 'HB', 'PLT', 'HCT', 'MCV', 'NEU', 'LYM', 'MONO', 'EOS', 'BASO'],
  },
  {
    id: 'coag',
    preferredOrder: ['PT', 'APTT', 'INR', 'D-DIMER', 'FDP', 'FIB'],
    codes: ['PT', 'PROTHROMBIN TIME', 'APTT', 'INR', 'D-DIMER', 'DDIMER', 'D DIMER', 'FDP', 'FIBRINOGEN', 'FIB'],
    loincCodes: ['5902-2', '6300-8', '14979-9', '3173-2', '6301-6', '34714-6', '30240-9', '48067-3', '7799-0', '48065-7', '3255-7', '30903-2', '13990-7', '4530-2'],
    pinnedColumns: ['PT', 'APTT', 'INR', 'D-DIMER'],
  },
  {
    id: 'chem',
    preferredOrder: ['BUN', 'CREA', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'UA', 'NA', 'K', 'CA', 'IP', 'AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'LDH', 'TP', 'ALB', 'CRP', 'FIB-4'],
    codes: ['TP', 'ALB', 'BUN', 'CREA', 'CREAT', 'CREAT.', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'NA', 'K', 'CA', 'CACAL', 'IP', 'UA', 'AST', 'ALT', 'ALK-P', 'ALKP', 'GGT', 'G-GT', 'LDH', 'T.BILI', 'T.BILI.', 'TBILI', 'BILIT', 'BILI', 'D.BILI', 'DBILI', 'CRP', 'FIB-4', 'PCT', 'PROCALCITONIN', 'ESR', 'LACTATE'],
    loincCodes: ['2951-2', '2947-0', '2823-3', '6298-4', '3094-0', '6299-2', '2160-0', '38483-4', '33914-3', '48642-3', '48643-1', '62238-1', '69405-9', '77147-7', '1742-6', '1920-8', '6768-6', '2324-2', '14804-9', '1975-2', '1968-7', '1971-1', '2885-2', '1751-7', '17861-6', '2000-8', '49765-1', '2777-1', '14879-1', '3084-1', '1988-5', '30522-7', '1759-0', '2532-0', '75241-0', '4537-7', '30341-2', '14338-8'],
    subgroups: [
      { id: 'renal',       members: ['BUN', 'CREA', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'UA'] },
      { id: 'electrolyte', members: ['NA', 'K', 'CA', 'IP'] },
      { id: 'liver',       members: ['AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'LDH', 'TP', 'ALB'] },
      { id: 'inflam',      members: ['CRP', 'PROCALCITONIN', 'PCT', 'ESR', 'FIB-4', 'LACTATE'] },
    ],
    pinnedColumns: ['BUN', 'CREA', 'EGFR', 'UA', 'NA', 'K', 'CA', 'IP', 'AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'ALB'],
  },
  {
    id: 'endocrine',
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
    subgroups: [
      { id: 'thyroid',  members: ['TSH', 'FREE T4', 'FREE T3', 'T4', 'T3', 'FT4', 'FT3', 'RT3', 'REVERSE T3', 'ANTI-TPO', 'ANTI-TG', 'THYROGLOBULIN', 'TRAB', 'TBII'] },
      { id: 'parathy',  members: ['PTH', 'I-PTH', 'INTACT PTH', 'VITAMIN D', '25-OH-D', '25(OH)D', '25-OH VITAMIN D', 'CALCITONIN'] },
      { id: 'adrenal',  members: ['CORTISOL', 'ACTH', 'ALDOSTERONE', 'RENIN', 'PRA', 'DHEA', 'DHEA-S', 'DHEAS'] },
      { id: 'sexhorm',  members: ['LH', 'FSH', 'E2', 'ESTRADIOL', 'PROGESTERONE', 'TESTOSTERONE', 'FREE TESTOSTERONE', 'PROLACTIN', 'PRL', 'AMH', 'SHBG'] },
      { id: 'pancreas', members: ['INSULIN', 'C-PEPTIDE'] },
      { id: 'pituitary',members: ['GH', 'IGF-1', 'IGF1'] },
    ],
    pinnedColumns: ['TSH', 'FREE T4', 'FREE T3', 'CORTISOL'],
  },
  {
    id: 'lipid',
    preferredOrder: ['CHOL', 'TG', 'HDL', 'LDL', 'LDL(計算值)', 'RISKF', 'VLDL', 'NON-HDL', 'APO-A1', 'APO-B', 'LP(A)'],
    codes: ['CHOL', 'CHOL.', 'CHOLESTEROL', 'TG', 'TRIG', 'TRIGLYCERIDE', 'HDLC', 'HDL', 'HDL-C', 'HDLC.', 'LDLC', 'LDL', 'LDL-C', 'LDLC.', 'LDL(計算值)', 'RISKF', 'VLDL', 'VLDLC', 'VLDL-C', 'NON-HDLC', 'NON-HDL', 'NON-HDL-C', 'APO-A', 'APO-A1', 'APOA1', 'APO-B', 'APOB', 'LP(A)'],
    loincCodes: ['2093-3', '14647-2', '14646-4', '2571-8', '3043-7', '2085-9', '2086-7', '14646-4', '2089-1', '13457-7', '2090-9', '13457-7', '43396-1', '13458-5', '11054-4', '2089-1', '13457-7', '18261-8', '18262-6', '10835-7'],
    pinnedColumns: ['CHOL', 'TG', 'HDL', 'LDL'],
  },
  {
    id: 'glucose',
    preferredOrder: ['GLUCOSE-AC', 'GLUCOSE', 'GLUCOSE-FS', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC', 'HBA1C', 'C-PEPTIDE'],
    // SUGAR / FINGER SUGAR: some Taiwan clinics use these for blood glucose.
    // Urine dipstick "Sugar" with qualitative value (+, ++, 4+, negative)
    // is routed to urine via the qualitative-value heuristic earlier.
    codes: ['GLUCOSE', 'GLU', 'GLU-AC', 'GLU(AC)', 'GLUCOSE(AC)', 'GLUCOSE AC', 'SUGAR', 'FINGER SUGAR', 'GLU,1HRPC', 'GLU,2HRPC', 'GLU,3HRPC', 'HBA1C', 'HBA1', 'A1C', 'HB-A1C', 'C-PEPTIDE'],
    loincCodes: ['2345-7', '2339-0', '14749-6', '15074-8', '41653-7', '4548-4', '17856-6', '4549-2', '1986-9'],
    pinnedColumns: ['GLUCOSE-AC', 'GLUCOSE', 'HBA1C'],
  },
  {
    id: 'hep',
    // Routine B 肝 screen = HBsAg + Anti-HBs + Anti-HBc (distinguishes vaccine
    // vs natural immunity). HBeAg/Anti-HBe only ordered for known HBsAg(+)
    // carriers; HBcAg not routinely tested in serum. Anti-HCV for C 肝.
    preferredOrder: ['HBSAG', 'ANTI-HBS', 'ANTI-HBC', 'ANTI-HCV', 'HBCAG', 'HBEAG', 'ANTI-HBE'],
    codes: ['HBSAG', 'HBS AG', 'HBS-AG', 'ANTI-HBS', 'HBCAG', 'HBC AG', 'HBC-AG', 'ANTI-HBC', 'HBEAG', 'HBE AG', 'HBE-AG', 'ANTI-HBE', 'ANTI-HCV'],
    loincCodes: ['5195-3', '5193-8', '13954-3', '13955-0', '13499-9', '22322-2', '16934-2'],
    pinnedColumns: ['HBSAG', 'ANTI-HBS', 'ANTI-HBC', 'ANTI-HCV'],
  },
  {
    id: 'tumor',
    preferredOrder: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'FPSA/PSA', 'FPSA', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'PIVKA-II', 'PIVKA'],
    codes: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'TPSA', 'T-PSA', 'PSA(T)', 'PSA-T', 'FPSA/PSA', 'FPSA', 'F-PSA', 'PSA-F', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'B-HCG', 'BETA-HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'PIVKA-II', 'PIVKA'],
    loincCodes: ['1834-1', '2039-6', '10334-1', '24108-3', '2857-1', '10886-0', '24467-3', '47238-1', '83112-3', '19201-2', '53764-7', '15067-2', '15083-9', '47239-9'],
    pinnedColumns: ['AFP', 'CEA', 'CA-199', 'CA-125', 'CA-153', 'PSA', 'FERRITIN'],
  },
  {
    id: 'urine',
    preferredOrder: ['COLOR', 'PH', 'SUGAR', 'TRANS', 'BILI', 'PROT', 'KETON', 'KETONE', 'UROBI', 'GRAVIT', 'NITRIT', 'NITRITE', 'OCCULT', 'WBC', 'RBC', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'],
    // Note: SUGAR is NOT in urine codes — some clinics report blood glucose as
    // "Sugar". Urine dipstick sugar is detected via the qualitative-value
    // heuristic (Negative/+/++/etc.) earlier in categorizeObservation.
    codes: ['COLOR', 'TRANS', 'TRANSPARENT', 'TURBIDITY', 'APPEARANCE', 'GRAVIT', 'GRAVITY', 'SP.GRAVITY', 'PROTEIN', 'PROT', 'KETON', 'KETONE', 'UROBI', 'UROBILINOGEN', 'NITRIT', 'NITRITE', 'OCCULT', 'OCCULT BLOOD', 'BLOOD', 'EPITH', 'EPITH CELL', 'EPITHELIAL CELL', 'WBCPUS', 'WBC/HPF', 'RBC/HPF', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'CASTS', 'CRYSTAL', 'BACTERIA', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO', 'ACR', 'UACR', 'MALB', 'MALB(U)'],
    loincCodes: ['5778-6', '5803-2', '5774-5', '5767-9', '5797-6', '5804-0', '5802-4', '5794-3', '5811-5', '5799-2', '20454-5', '5821-4', '5808-1'],
    subgroups: [
      { id: 'physical',  members: ['COLOR', 'TRANS', 'TRANSPARENT', 'GRAVIT', 'GRAVITY', 'PH'] },
      { id: 'chemical',  members: ['SUGAR', 'GLUCOSE', 'PROT', 'PROTEIN', 'KETON', 'KETONE', 'T.BILI', 'BILIRUBIN', 'UROBI', 'UROBILINOGEN', 'NITRIT', 'NITRITE', 'OCCULT', 'BLOOD'] },
      { id: 'micro',     members: ['WBC', 'RBC', 'WBCPUS', 'EPITH', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3'] },
      { id: 'ratio',     members: ['PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO'] },
    ],
    pinnedColumns: ['COLOR', 'PH', 'GRAVIT', 'PROT', 'GLUCOSE', 'KETONE', 'BILI', 'UROBI', 'NITRITE', 'OCCULT'],
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
  // 0a. Specimen quality indicators (hemolysis, lipemia, icterus) are not
  //     clinical lab results — exclude regardless of whatever LOINC the bridge assigns.
  if (/溶血|hemoly|lipemia|脂血|icterus|icteric|黃疸指數/i.test(fullText)) return null

  // 0b. Laboratory QC / control plasma readings — bridge sometimes emits
  //     "正常血漿PT平均值" (normal-plasma PT mean) as a patient Observation.
  //     This is the lab's calibration baseline used to derive INR
  //     (INR = patient PT / NPM ^ ISI). It varies batch-to-batch with
  //     reagent lot and isn't a patient measurement, so it must not
  //     occupy a column in the cumulative report. Skip on the same
  //     defence-in-depth line as the hemolysis rule above; ideal fix is
  //     bridge-side (don't emit as patient Observation at all), but
  //     this guards us until that lands.
  if (/正常血漿|Nor\.?\s*plasma|normal\s*plasma\s*mean|NPM\b|control\s*plasma/i.test(fullText)) return null

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

  // Pure allowlist: anything not matched by exact code or LOINC is excluded.
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
