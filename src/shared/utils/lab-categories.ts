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

import { FHIR_SYSTEM_FRAGMENTS } from '@/src/shared/constants/fhir-systems.constants'

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
  /** When true this category is NOT shown as a sub-tab by default — it is
   *  revealed only after the user clicks the 「查看更多」 chip in the cumulative
   *  report. For panels ordered on a minority of (usually critically-ill)
   *  patients (e.g. arterial blood gas) that would otherwise add a persistently
   *  empty tab to routine outpatient labs. */
  hiddenByDefault?: boolean
}

export const LAB_CATEGORIES: LabCategory[] = [
  {
    id: 'cbc',
    // Differential order — clinical reading convention puts mature
    // neutrophils first (NEU, the bridge canonical that SEG / SEG. /
    // Segmented / 嗜中性白血球 all collapse to via TEST_ALIASES), then
    // immature band-form (BAND), then the other lineages in decreasing
    // frequency: LYM → MONO → EOS → BASO. ANC tails as a derived value.
    // Only canonical keys go here — variants like SEG / NEU. / LYM. are
    // dead entries because getAnalyteLabel always returns the canonical
    // (see memory/feedback_canonical_only_in_preferredorder.md).
    preferredOrder: ['WBC', 'RBC', 'HB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW', 'PLT', 'MPV', 'NEU', 'BAND', 'LYM', 'MONO', 'EOS', 'BASO', 'ANC'],
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
      { id: 'diff',    members: ['NEU', 'BAND', 'LYM', 'MONO', 'EOS', 'BASO', 'ANC'] },
      { id: 'indices', members: ['HCT', 'MCV', 'MCH', 'MCHC', 'RDW'] },
    ],
    pinnedColumns: ['WBC', 'RBC', 'HB', 'PLT', 'HCT', 'MCV', 'NEU', 'LYM', 'MONO', 'EOS', 'BASO'],
  },
  {
    id: 'coag',
    // Column order follows clinical reading habit:
    //   PT + INR are the same test in two forms (INR = (PT/control)^ISI),
    //   so they sit side-by-side. APTT then APTT-ratio next to each other
    //   for the same reason (ratio = APTT/control mean). D-DIMER stands
    //   alone. FDP/FIB tail-in if reported. APTT-RATIO is not pinned —
    //   hospitals that only report seconds shouldn't see an empty stub.
    preferredOrder: ['PT', 'INR', 'APTT', 'APTT-RATIO', 'D-DIMER', 'FDP', 'FIB'],
    codes: ['PT', 'PROTHROMBIN TIME', 'APTT', 'APTT-RATIO', 'INR', 'D-DIMER', 'DDIMER', 'D DIMER', 'FDP', 'FIBRINOGEN', 'FIB'],
    // 63561-5 = aPTT --actual/normal (ratio variant of 14979-9). NOT added
    // to LOINC_TO_CANONICAL because we resolve APTT/APTT-RATIO via display
    // text — keeps bridge LOINC mis-tags visible.
    loincCodes: ['5902-2', '6300-8', '14979-9', '63561-5', '3173-2', '6301-6', '34714-6', '30240-9', '48067-3', '7799-0', '48065-7', '3255-7', '30903-2', '13990-7', '4530-2'],
    pinnedColumns: ['PT', 'INR', 'APTT', 'D-DIMER'],
  },
  {
    id: 'chem',
    // Column order: …liver → 發炎/感染(inflam) → 心肌酵素(cardiac). Inflammation
    // group (CRP → PCT → ESR → LACTATE → FIB-4) reads acute-phase reactants
    // first (CRP/PCT for bacterial vs viral), then ESR (sub-acute/autoimmune),
    // then LACTATE (sepsis/shock); FIB-4 (derived liver fibrosis index) tails.
    // Cardiac (TROP → CK → CK-MB) is grouped here per Taiwan convention —
    // 生化室 owns the assay even though clinically they're cardiac markers.
    // A/G (LOINC 1759-0) was removed from loincCodes: it has no subgroup home
    // and surfaced as an orphan in the "其他" column; not wanted in 累積報告.
    // CO2 (total CO2 / TCO2) + MG sit with the electrolytes (the classic BMP
    // NA·K·CL·CO2 set + magnesium); NT-PROBNP tails with the cardiac markers
    // (heart-failure marker, 生化室 assay). Canonical keys only here — text
    // variants live in `codes` — per feedback_canonical_only_in_preferredorder.
    preferredOrder: ['BUN', 'CREA', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'UA', 'NA', 'K', 'CL', 'CO2', 'CA', 'IP', 'MG', 'AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'LDH', 'TP', 'ALB', 'CRP', 'PCT', 'ESR', 'LACTATE', 'FIB-4', 'TROP', 'CK', 'CKMB', 'NT-PROBNP'],
    // CO2 variants stay TCO2-specific — NOT 'BICARBONATE'/'HCO3', which is the
    // arterial blood-gas analyte (own category). NT-proBNP variants kept
    // distinct from BNP (a different assay we don't fold in here).
    codes: ['TP', 'ALB', 'BUN', 'CREA', 'CREAT', 'CREAT.', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'NA', 'K', 'CL', 'CHLORIDE', 'CO2', 'TCO2', 'T-CO2', 'TOTAL CO2', '二氧化碳', '二氧化碳總量', 'CA', 'CACAL', 'IP', 'MG', 'MAGNESIUM', '鎂', 'UA', 'AST', 'ALT', 'ALK-P', 'ALKP', 'GGT', 'G-GT', 'LDH', 'T.BILI', 'T.BILI.', 'TBILI', 'BILIT', 'BILI', 'D.BILI', 'DBILI', 'TROP', 'TROPONIN', 'TROPONIN I', 'TROPONIN T', 'CK', 'CK-MB', 'CKMB', 'CREATINE KINASE', 'CPK', '肌酸激酶', 'CRP', 'FIB-4', 'PCT', 'PROCALCITONIN', 'ESR', 'LACTATE', 'NT-PROBNP', 'NT-PRO-BNP', 'NTPROBNP', 'PROBNP'],
    // 2075-0 = Chloride Moles/vol S/P — verified at loinc.org (2026-06-02).
    // 10839-9 = Troponin I.cardiac [Mass/volume] in Serum or Plasma — bridge
    // ships this for NHI 09099C 心肌旋轉蛋白Ｉ. The high-sensitivity LOINCs
    // (49563-0 hs-cTnI, 6598-7 cTnT, 67151-1 hs-cTnT) are intentionally
    // omitted until we see a real bridge bundle using them, so the
    // LOINC_TO_CANONICAL map stays in lock-step.
    // 2157-6 = Creatine kinase [Enzymatic activity/volume] in Serum or Plasma
    // (CK total) and 13969-1 = Creatine kinase.MB [Mass/volume] in Serum or
    // Plasma (CK-MB) — both verified at loinc.org (2026-06-16).
    // 2028-9 = Carbon dioxide, total [Moles/volume] S/P (TCO2), 19123-9 =
    // Magnesium [Mass/volume] S/P, 33762-6 = NT-proBNP [Mass/volume] S/P —
    // all three already mapped + cited in lab-normalize LOINC_TO_CANONICAL
    // (CO2 / MG / NT-PROBNP); added here so they categorise into 生化 instead
    // of falling to 其他 (user report 2026-07-07; live loinc.org re-check was
    // classifier-blocked, mappings reused from the verified in-repo table).
    loincCodes: ['2951-2', '2947-0', '2823-3', '6298-4', '2075-0', '3094-0', '6299-2', '2160-0', '38483-4', '33914-3', '48642-3', '48643-1', '62238-1', '69405-9', '77147-7', '1742-6', '1920-8', '6768-6', '2324-2', '14804-9', '1975-2', '1968-7', '1971-1', '2885-2', '1751-7', '17861-6', '2000-8', '49765-1', '2777-1', '14879-1', '3084-1', '10839-9', '2157-6', '13969-1', '1988-5', '30522-7', '2532-0', '75241-0', '4537-7', '30341-2', '14338-8', '2028-9', '19123-9', '33762-6'],
    subgroups: [
      { id: 'renal',       members: ['BUN', 'CREA', 'EGFR(EPI)', 'EGFR(M)', 'EGFR', 'UA'] },
      { id: 'electrolyte', members: ['NA', 'K', 'CL', 'CO2', 'CA', 'IP', 'MG'] },
      { id: 'liver',       members: ['AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'LDH', 'TP', 'ALB'] },
      // 發炎/感染 sits to the LEFT of 心肌酵素 (inflam before cardiac) per the
      // user's reading order. CK + CK-MB join TROP under 心肌酵素; NT-proBNP
      // (heart-failure marker) tails the cardiac group.
      { id: 'inflam',      members: ['CRP', 'PROCALCITONIN', 'PCT', 'ESR', 'FIB-4', 'LACTATE'] },
      { id: 'cardiac',     members: ['TROP', 'CK', 'CKMB', 'NT-PROBNP'] },
    ],
    // CL deliberately not pinned — most ambulatory chem panels don't include
    // chloride, so pinning would create persistent empty columns. When a
    // hospital does report it, the data-presence rule will surface the column.
    // TROP also intentionally NOT pinned — only ordered for acute MI workup,
    // pinning would create a persistent empty column on routine outpatient labs.
    // Pin EGFR(M) — the key NHI eGFR resolves to (bare / MDRD, per Taiwan
    // convention). Pinning bare 'EGFR' created a permanently-empty
    // "腎絲球過濾率 EGFR" stub column beside the populated one, since real data
    // never lands on the bare key. CKD-EPI (EGFR(EPI)) surfaces as its own
    // column on data presence, so it isn't pinned.
    pinnedColumns: ['BUN', 'CREA', 'EGFR(M)', 'UA', 'NA', 'K', 'CA', 'IP', 'AST', 'ALT', 'T.BILI', 'D.BILI', 'ALK-P', 'GGT', 'ALB'],
  },
  {
    id: 'endocrine',
    preferredOrder: [
      // Thyroid
      'TSH', 'FREE T4', 'FREE T3', 'T4', 'T3', 'RT3', 'ANTI-TPO', 'ANTI-TG', 'THYROGLOBULIN',
      // Parathyroid / Bone
      'PTH', 'VITAMIN D', '25-OH VITAMIN D', 'CALCITONIN',
      // Adrenal
      'CORTISOL', 'ACTH', 'ALDOSTERONE', 'RENIN', 'DHEA-S',
      // Sex hormones — PRL is the canonical that PROLACTIN aliases to in
      // TEST_ALIASES; using 'PROLACTIN' here would never match a sorted
      // label (getAnalyteLabel always returns PRL), per
      // memory/feedback_canonical_only_in_preferredorder.md.
      'LH', 'FSH', 'E2', 'PROGESTERONE', 'TESTOSTERONE', 'PRL', 'AMH', 'SHBG',
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
      { id: 'thyroid',  members: ['TSH', 'FREE T4', 'FREE T3', 'T4', 'T3', 'RT3', 'ANTI-TPO', 'ANTI-TG', 'THYROGLOBULIN', 'TRAB', 'TBII'] },
      { id: 'parathy',  members: ['PTH', 'I-PTH', 'INTACT PTH', 'VITAMIN D', '25-OH-D', '25(OH)D', '25-OH VITAMIN D', 'CALCITONIN'] },
      { id: 'adrenal',  members: ['CORTISOL', 'ACTH', 'ALDOSTERONE', 'RENIN', 'PRA', 'DHEA', 'DHEA-S', 'DHEAS'] },
      { id: 'sexhorm',  members: ['LH', 'FSH', 'E2', 'PROGESTERONE', 'TESTOSTERONE', 'FREE TESTOSTERONE', 'PRL', 'AMH', 'SHBG'] },
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
    // carriers; HBcAg not routinely tested in serum. Anti-HCV for C 肝 — tails
    // at the end so the full B 肝 panel reads contiguously before the
    // clinician's eye jumps to a different virus.
    preferredOrder: ['HBSAG', 'ANTI-HBS', 'ANTI-HBC', 'HBEAG', 'ANTI-HBE', 'HBCAG', 'ANTI-HCV'],
    codes: ['HBSAG', 'HBS AG', 'HBS-AG', 'ANTI-HBS', 'HBCAG', 'HBC AG', 'HBC-AG', 'ANTI-HBC', 'HBEAG', 'HBE AG', 'HBE-AG', 'ANTI-HBE', 'ANTI-HCV'],
    // HBsAg has 3 LOINCs — Presence(5195-3) / quantitative Units-vol(5196-1) /
    // RIA(5197-9); all three already resolve to HBSAG in LOINC_TO_CANONICAL, so
    // this loincCodes list must carry them all or a quantitative-HBsAg result
    // (NHI 14032C → 5196-1, COI value) falls through to 「其他」 (drift found
    // 2026-07-08 on a real 健保存摺 bundle).
    loincCodes: ['5195-3', '5196-1', '5197-9', '5193-8', '13954-3', '13955-0', '13499-9', '22322-2', '16934-2'],
    pinnedColumns: ['HBSAG', 'ANTI-HBS', 'ANTI-HBC', 'ANTI-HCV'],
  },
  {
    id: 'tumor',
    // F-PSA is the canonical that FPSA / PSA-F / FREE PSA all alias to in
    // TEST_ALIASES — using 'FPSA' here would never match a sorted label
    // (see memory/feedback_canonical_only_in_preferredorder.md). CA-125 /
    // CA-153 / CA-199 are likewise canonical for the various hyphen / space
    // variants their aliases collapse to.
    preferredOrder: ['AFP', 'CEA', 'CA-125', 'CA-153', 'CA-199', 'PSA', 'FPSA/PSA', 'F-PSA', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'PIVKA-II', 'PIVKA'],
    codes: ['AFP', 'CEA', 'CA-125', 'CA125', 'CA-153', 'CA153', 'CA-199', 'CA199', 'CA19-9', 'PSA', 'TPSA', 'T-PSA', 'PSA(T)', 'PSA-T', 'FPSA/PSA', 'FPSA', 'F-PSA', 'PSA-F', 'FERRITIN', 'B2M', 'SCC', 'HCG', 'B-HCG', 'BETA-HCG', 'FB_HCG', 'HTG', 'CALCITONIN', 'CA72_4', 'CA72-4', 'CYF21_1', 'CYFRA21-1', 'NSE', 'TPA', 'PIVKA-II', 'PIVKA'],
    loincCodes: ['1834-1', '2039-6', '10334-1', '24108-3', '2857-1', '10886-0', '24467-3', '47238-1', '83112-3', '19201-2', '53764-7', '15067-2', '15083-9', '47239-9'],
    pinnedColumns: ['AFP', 'CEA', 'CA-199', 'CA-125', 'CA-153', 'PSA', 'FERRITIN'],
  },
  {
    id: 'urine',
    // Column order — clinical urinalysis report convention, left to right:
    //   1. Physical inspection  (COLOR → APPEARANCE/TURBIDITY → GRAVIT → PH)
    //   2. Chemistry dipstick   (PROT → GLUCOSE → KETONE → BILI → UROBI →
    //                            NITRITE → LE → OCCULT) — metabolic markers
    //                            first, infection markers after
    //   3. Microscopy           (WBC → RBC → EPITH CELL → CASTS → CRYSTALS)
    //   4. Quantitative ratios  (MALB → CREA → ACR; PROT(SPOT) → CR(SPOT) →
    //                            PROT/CR RATIO; CALB(SPOT) → ALB/CR RATIO)
    // Within each section: clinically-frequent items first, rarer at tail.
    // Each canonical key listed here is normalize()d at sort time, so case +
    // punctuation variants (e.g. 'GRAVIT' vs 'GRAVITY' vs 'SP.GRAVITY') don't
    // need explicit duplicate entries when they collapse to the same key.
    preferredOrder: [
      // ── Physical ────────────────────────────────────────────
      'COLOR', 'APPEARANCE', 'TURBIDITY', 'TRANS', 'TRANSPARENT',
      'GRAVIT', 'GRAVITY', 'SP.GRAVITY',
      'PH',
      // ── Chemistry (dipstick) ────────────────────────────────
      'PROT', 'PROTEIN',
      'GLUCOSE', 'SUGAR',
      'KETONE', 'KETON',
      'BILI', 'BILIRUBIN',
      'UROBI', 'UROBILINOGEN',
      'NITRITE', 'NITRIT',
      'LE',
      'OCCULT', 'OCCULT BLOOD', 'BLOOD',
      // ── Microscopic ─────────────────────────────────────────
      'WBC', 'WBCPUS', 'WBC/HPF',
      'RBC', 'RBC/HPF',
      'EPITH', 'EPITH CELL', 'EPITHELIAL CELL',
      'CAST1', 'CAST2', 'CAST3', 'CASTS',
      'CRYS1', 'CRYS2', 'CRYS3', 'CRYSTAL', 'BACTERIA', 'MUCUS',
      // ── Quantitative / ratio ────────────────────────────────
      'MALB', 'MALB(U)',
      'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'CREA',
      'PROT/CR RATIO', 'ALB/CR RATIO', 'ACR', 'UACR',
      '微白蛋白/肌酐酸比值', '微白蛋白/肌酸酐比值',
    ],
    // Note: SUGAR is NOT in urine codes — some clinics report blood glucose as
    // "Sugar". Urine dipstick sugar is detected via the qualitative-value
    // heuristic (Negative/+/++/etc.) earlier in categorizeObservation.
    codes: ['COLOR', 'TRANS', 'TRANSPARENT', 'TURBIDITY', 'APPEARANCE', 'GRAVIT', 'GRAVITY', 'SP.GRAVITY', 'PROTEIN', 'PROT', 'KETON', 'KETONE', 'UROBI', 'UROBILINOGEN', 'NITRIT', 'NITRITE', 'OCCULT', 'OCCULT BLOOD', 'BLOOD', 'EPITH', 'EPITH CELL', 'EPITHELIAL CELL', 'WBCPUS', 'WBC/HPF', 'RBC/HPF', 'CAST1', 'CAST2', 'CAST3', 'CRYS1', 'CRYS2', 'CRYS3', 'CASTS', 'CRYSTAL', 'BACTERIA', 'MUCUS', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO', 'ACR', 'UACR', '微白蛋白/肌酐酸比值', '微白蛋白/肌酸酐比值', '白蛋白/肌酐酸比值', '白蛋白/肌酸酐比值', 'MALB', 'MALB(U)', 'LE'],
    // 2026-05-29 additions (verified at loinc.org): 5792-7 Urine glucose,
    // 5818-0 Urobilinogen urine, 5770-3 Bilirubin urine, 14957-5 Microalbumin
    // urine, 14959-1 Microalbumin/Creatinine ratio. These were previously
    // routed to urine only via the qualitative-result heuristic; now that
    // LOINC check runs before text-based passes, they need to be in this
    // allowlist directly.
    // 2026-06-14 additions (verified at loinc.org): 5787-7 Epithelial cells,
    // 25145-4 Bacteria, 5783-6 Crystals, 8247-9 Mucus [Presence] by Light
    // microscopy — all "Urine sed" microscopy. Added so the sediment rows
    // categorise into urine via LOINC (they were absent and would only catch
    // via the qualitative-result text heuristic). 8247-9 is the corrected code
    // the bridge now emits for the mucus row (was panel code 24356-8).
    loincCodes: ['5778-6', '5803-2', '5774-5', '5767-9', '5797-6', '5804-0', '5802-4', '5794-3', '5811-5', '5799-2', '20454-5', '5821-4', '5808-1', '5792-7', '5818-0', '5770-3', '14957-5', '14959-1', '2161-8', '5787-7', '25145-4', '5783-6', '8247-9'],
    subgroups: [
      { id: 'physical',  members: ['COLOR', 'APPEARANCE', 'TURBIDITY', 'TRANS', 'TRANSPARENT', 'GRAVIT', 'GRAVITY', 'SP.GRAVITY', 'PH'] },
      { id: 'chemical',  members: ['PROT', 'PROTEIN', 'GLUCOSE', 'SUGAR', 'KETONE', 'KETON', 'BILI', 'BILIRUBIN', 'UROBI', 'UROBILINOGEN', 'NITRITE', 'NITRIT', 'LE', 'OCCULT', 'BLOOD'] },
      { id: 'micro',     members: ['WBC', 'WBCPUS', 'WBC/HPF', 'RBC', 'RBC/HPF', 'EPITH', 'EPITH CELL', 'CAST1', 'CAST2', 'CAST3', 'CASTS', 'CRYS1', 'CRYS2', 'CRYS3', 'CRYSTAL', 'BACTERIA', 'MUCUS'] },
      { id: 'ratio',     members: ['MALB', 'MALB(U)', 'CREA', 'PROT(SPOT)', 'CALB(SPOT)', 'CR(SPOT)', 'PROT/CR RATIO', 'ALB/CR RATIO', 'ACR', 'UACR'] },
    ],
    pinnedColumns: ['COLOR', 'PH', 'GRAVIT', 'PROT', 'GLUCOSE', 'KETONE', 'BILI', 'UROBI', 'NITRITE', 'OCCULT'],
  },
  {
    id: 'bloodgas',
    // Blood gas (ABG / VBG / CBG). hiddenByDefault → surfaced only via the
    // 「查看更多」 chip in the cumulative report; blood gas is ordered for a
    // minority of (usually critically-ill) patients so it would otherwise add a
    // near-always-empty tab to routine outpatient labs.
    //
    // MULTI-SPECIMEN, ONE COLUMN by design: arterial, venous AND capillary
    // LOINCs for each analyte map to the same canonical key (see
    // LOINC_TO_CANONICAL) so they collapse into a single pH / pCO2 / pO2 / SO2
    // column — the clinician tells arterial from venous by reading the O2
    // saturation / pO2 themselves, rather than the table splitting into
    // pO2 + pO2(V). Because a column mixes specimens, blood-gas analytes carry
    // NO hardcoded reference range (arterial vs venous ranges differ materially,
    // esp. pO2 / SO2); colouring comes only from each obs's own FHIR
    // referenceRange. All codes verified at loinc.org (2026-07-06) against the
    // official gas panels 24336-0 (Arterial) and 24339-4 (Venous); 3150-0 FiO2
    // is a ventilator setting with NO specimen, caught by the LOINC pass.
    // Reading order: gas tensions → acid-base → oxygenation → FiO2 (context).
    hiddenByDefault: true,
    preferredOrder: ['PH', 'PCO2', 'PO2', 'HCO3', 'BE', 'SO2', 'FIO2'],
    // Bare 'PH' is deliberately NOT in codes[] — it collides with urinalysis
    // pH; blood-gas pH is resolved via LOINC (Pass 2) + blood specimen (Pass 1).
    // Short codes stay specimen-neutral where possible, with a few arterial/
    // venous text variants for bridges that ship short names without a LOINC.
    codes: ['PCO2', 'PACO2', 'PVCO2', 'PO2', 'PAO2', 'PVO2', 'HCO3', 'BE', 'SO2', 'SAO2', 'SVO2', 'FIO2'],
    loincCodes: [
      // pH: arterial / venous / capillary
      '2744-1', '2746-6', '2745-8',
      // pCO2: arterial / venous / capillary
      '2019-8', '2021-4', '2020-6',
      // pO2: arterial / venous / capillary
      '2703-7', '2705-2', '2704-5',
      // Bicarbonate: arterial / venous
      '1960-4', '14627-4',
      // Base excess: arterial / venous
      '1925-7', '1927-3',
      // O2 saturation: arterial / venous
      '2708-6', '2711-0',
      // Generic "Blood" (unspecified vessel): pH / pCO2 / pO2 / bicarbonate /
      // base excess / O2 saturation — verified loinc.org 2026-07-06.
      '11558-4', '11557-6', '11556-8', '1959-6', '11555-0', '20564-1',
      // FiO2
      '3150-0',
    ],
    pinnedColumns: ['PH', 'PCO2', 'PO2', 'HCO3', 'BE', 'SO2', 'FIO2'],
  },
  {
    id: 'serology',
    // Viral antigen / serology ordered on a respiratory / infection workup
    // (流感 A/B、新冠抗原、黴漿菌 IgM). 健保存摺 ships these WITHOUT LOINC, so
    // categorise by NHI 醫令 code (14065C/14066C/14084C/12020C) — the reliable
    // identifier (code.text is inconsistent). Analyte canonicalisation +
    // display labels live in lab-normalize (TEST_ALIASES / CANONICAL_DISPLAY).
    // hiddenByDefault: a minority panel — surfaced via 「查看更多」only when the
    // patient actually has it, no persistently-empty tab for routine labs.
    // No pinnedColumns (so the tab is nonEmpty ONLY when real data exists);
    // preferredOrder just fixes column order when it does.
    preferredOrder: ['FLU-A-AG', 'FLU-B-AG', 'COVID-AG', 'MYCOPLASMA-IGM'],
    codes: ['FLU-A-AG', 'FLU-B-AG', 'COVID-AG', 'MYCOPLASMA-IGM', '14065C', '14066C', '14084C', '12020C'],
    hiddenByDefault: true,
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

// ── NHI 醫令章節閘 (name-collision gate) ──────────────────────────────────
// The 08 section is 血液學檢查 (hematology + coagulation, NHI 08001–08134, per
// the 健保給付標準 — verified against NHI-FHIR-Bridge's NHI↔LOINC table). CBC
// differential names like "Neutrophil" / "嗜中性白血球" collide with non-blood
// microscopy rows — e.g. 13006C 細菌顯微鏡檢查 reports pus cells as "Neutrophil
// 1+(>25/LPF)" with NO LOINC and NO specimen, which the name-based passes below
// would otherwise mis-route into the blood CBC NEU column. Pass 1 already blocks
// non-blood SPECIMENS; this blocks non-blood NHI CODES so a NAME match into
// cbc/coag is rejected when the obs carries an NHI code from another section.
// LOINC matches (Pass 2) are deliberately NOT gated — bridge LOINC is the
// authoritative identifier and its errors must stay visible (no-masking policy).
// Each cleanly-single-section category → the NHI 醫令 section prefix(es) it
// legitimately comes from. Only categories with a CLEAN section boundary are
// listed:
//   • cbc / coag → 08  血液學檢查 (08001–08134; verified vs 健保給付標準)
//   • urine      → 06  尿液一般 / 尿生化檢查
// chem is deliberately ABSENT: its inflammation markers span sections (CRP & PCT
// are 12 免疫, ESR is 08), so a 09-only gate would wrongly drop them. Sections
// confirmed empirically against NHI-FHIR-Bridge's NHI↔LOINC table
// (06 尿, 07 糞便, 08 血液/凝血, 09 生化, 11 血庫, 12 免疫/腫瘤, 13 微生物, 14 血清).
const CATEGORY_NHI_SECTIONS: Record<string, string[]> = {
  cbc: ['08'],
  coag: ['08'],
  urine: ['06'],
}

function nhiOrderCode(obs: any): string | null {
  const codings: any[] = Array.isArray(obs?.code?.coding) ? obs.code.coding : []
  for (const c of codings) {
    const system = typeof c?.system === 'string' ? c.system : ''
    if (system.includes(FHIR_SYSTEM_FRAGMENTS.NHI_MEDICAL_ORDER_CODE)) {
      const code = typeof c?.code === 'string' ? c.code.trim().toUpperCase() : ''
      if (code) return code
    }
  }
  return null
}

// A NAME-based category match is rejected when the obs carries an NHI code from
// a section incompatible with that category — so a 13xxx microbiology row can't
// ride a CBC name into 血液 nor a "Bacteria" name into 尿液. obs WITHOUT an NHI
// code fall through unchanged (most non-NHI FHIR data; specimen routing in Pass 1
// handles those when a specimen is present). Categories absent from the map are
// never gated.
function nameMatchAllowedForCategory(cat: LabCategory, obs: any): boolean {
  const sections = CATEGORY_NHI_SECTIONS[cat.id]
  if (!sections) return true
  const nhi = nhiOrderCode(obs)
  return !nhi || sections.some((p) => nhi.startsWith(p))
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
  // (Previously: 溶血/脂血/icterus filter removed 2026-05-29.) Bridge still
  // emits these specimen-quality flags as 0-value obs borrowing real analyte
  // LOINCs (BUN 3094-0, Cholesterol 2093-3 etc.) in v0.12.1. We intentionally
  // do NOT filter them so the bridge bug stays visible in the UI — the
  // cumulative report will show 0-value BUN/Cholesterol cells until bridge
  // fixes its end. See memory/feedback_no_masking_bridge_bugs.md.

  // Pass ordering — refactored 2026-05-29 (v0.13.0 audit):
  //   1. Specimen-based routing      (authoritative boundary between blood/urine/other)
  //   2. LOINC against cat.loincCodes (authoritative analyte identifier)
  //   3. Exact short-code match against cat.codes (VGH/local short codes)
  //   4. Stripped-display match  (handles "Serum TSH(ECLIA)" → "TSH")
  //   5. Text-based urine fallback (only when 1–4 missed)
  //   6. Qualitative-result fallback (only when 1–5 missed)
  //
  // Previous version ran text-based routing BEFORE LOINC, which caused the
  // Chinese single-char `尿` substring to incorrectly capture blood analytes
  // 尿酸 (UA) and 尿素氮 (BUN) before LOINC had a chance to route them to
  // chem. Bridge v0.13.0 correctly sets specimen=Blood for those rows, so
  // even with specimen ordering alone the UA bug would be fixable — but the
  // wider issue (LOINC is the authoritative identifier, deserves priority)
  // is what this reordering addresses. Also removes the now-redundant
  // HbA1c text override: LOINC 4548-4 in glucose.loincCodes catches it,
  // and the text 'HbA1c' / 'HB-A1C' / 'GLYCATED' all match glucose.codes
  // entries via Pass 3/4 below.

  // ── Pass 1: specimen-based routing ─────────────────────────────────────
  const specimenText = String(obs.specimen?.display || obs.category?.[1]?.text || '')
  const specimenSaysBlood = !!specimenText &&
    /blood|serum|plasma|whole\s*blood|venous|capillary|血/i.test(specimenText)
  if (specimenText) {
    if (/urine|urinaly|尿/i.test(specimenText)) {
      return LAB_CATEGORIES.find((c) => c.id === 'urine') || null
    }
    // Non-blood/serum/plasma specimens (stool, sputum, CSF, pleural fluid,
    // ascites, smear, synovial fluid, amniotic, bone marrow…) aren't covered
    // by our 5 cumulative-report categories. Skip rather than miscategorize.
    if (!specimenSaysBlood) {
      return null
    }
  }

  // ── Pass 2: LOINC against cat.loincCodes (authoritative) ───────────────
  for (const cat of LAB_CATEGORIES) {
    if (!cat.loincCodes) continue
    const loincSet = new Set(cat.loincCodes.map(normalize))
    for (const cand of codeNorms) {
      if (loincSet.has(cand)) return cat
    }
  }

  // ── Pass 3: exact short-code match against cat.codes ───────────────────
  for (const cat of LAB_CATEGORIES) {
    const codeSet = new Set(cat.codes.map(normalize))
    for (const candidate of exactCandidates) {
      if (codeSet.has(candidate) && nameMatchAllowedForCategory(cat, obs)) return cat
    }
  }

  // ── Pass 4: stripped display-name match ────────────────────────────────
  // Handles verbose names like "Serum TSH(ECLIA ...)" where stripping the
  // prefix/parenthetical yields a short code ("TSH") that IS in codes[].
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
      if (codeSet.has(candidate) && nameMatchAllowedForCategory(cat, obs)) return cat
    }
  }

  // ── Pass 5: text-based urine fallback (only when nothing above matched) ─
  // Skip when bridge declared specimen=Blood — see big comment above for
  // the 尿酸 / 尿素氮 substring trap this guard avoids.
  if (!specimenSaysBlood && /\bURINE\b|尿/.test(fullText)) {
    return LAB_CATEGORIES.find((c) => c.id === 'urine') || null
  }

  // ── Pass 6: qualitative-result fallback ────────────────────────────────
  // Dipstick-style results ("4+", "Negative", "trace") are typical of
  // urinalysis. Skip when specimen=Blood so qualitative blood results
  // (ABO typing, antibody screens) don't get mis-routed. ALSO skip when the
  // obs carries an NHI 醫令碼 — coded data's category comes from the code
  // (LOINC / 08 section / …), not a value-shape guess. Without this a
  // microbiology microscopy row like 13006C "Neutrophil 1+(>25/LPF)" — already
  // blocked from CBC by the section gate above — would bounce into 尿液 on the
  // leading "1+". Uncoded sandbox/orphan dipstick rows (no NHI code) still fall
  // through here as before.
  if (!specimenSaysBlood && !nhiOrderCode(obs) && isQualitativeResult(obs)) {
    return LAB_CATEGORIES.find((c) => c.id === 'urine') || null
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

// canonical analyte key (normalized) → owning LabCategory, derived from each
// category's preferredOrder. Lets a canonical short code (resolved via
// getAnalyteLabel) be mapped to a category WITHOUT re-running the LOINC/code
// allowlist in categorizeObservation — which matters for bridge data that
// sends Chinese display text with no LOINC ("白血球計數" → WBC via
// TEST_ALIASES): categorizeObservation can't match those English-only codes,
// but the canonical key still lands in the right category here.
export const CANONICAL_TO_CATEGORY: Map<string, LabCategory> = (() => {
  const m = new Map<string, LabCategory>()
  for (const cat of LAB_CATEGORIES) {
    for (const k of cat.preferredOrder || []) {
      const norm = normalize(k)
      if (!m.has(norm)) m.set(norm, cat)
    }
  }
  return m
})()
