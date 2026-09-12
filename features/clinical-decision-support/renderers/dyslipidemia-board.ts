/**
 * Lipid metrics and medication states for the five-section visit flow.
 * Read recommendations AND completed automated checks so an at-goal LDL-C
 * remains visible. Safety review rows, including TG ≥1000, remain alerts.
 * A medication tile reads its own prescription evidence; the module status
 * describes the reconciliation decision, never whether a drug is being taken.
 * Complete evidence, other nonstatin options and NHI assessments stay in the
 * standard expandable module detail.
 */
import type {
  CdssLocale,
  CdssResult,
} from '../types'
import {
  buildDiseaseBoard,
  type DiseaseBoardConfig,
  type DiseaseBoardModel,
} from './disease-board'

export const DYSLIPIDEMIA_PACK_ID = 'hyperlipidemia-cdss'

export const DYSLIPIDEMIA_BOARD_CONFIG: DiseaseBoardConfig = {
  packId: DYSLIPIDEMIA_PACK_ID,
  testIdPrefix: 'cdss-lipid',
  headlineModuleId: 'dyslipidemia-risk-and-target',
  headlineFactKey: 'LDL',
  headlineKind: 'lab',
  headlineLabel: { zh: 'LDL-C', en: 'LDL-C' },
  headlineHeading: { zh: '風險與目標', en: 'Risk and goal' },
  /**
   * The rest of the lipid panel in the order it is read — LDL-C is the
   * headline, not a strip tile — then the three non-lipid inputs the risk
   * module actually reads. Every key here appears in some module's
   * `patientEvidence`; `kind` says how a missing one is obtained, and
   * non-HDL-C is the one the pack computes rather than orders.
   */
  metrics: [
    // LDL-C is the headline number with its own date; a strip tile would print
    // it a second line below itself.
    { factKey: 'nonHDL', zh: 'non-HDL-C', en: 'non-HDL-C', kind: 'derived' },
    { factKey: 'HDL', zh: 'HDL-C', en: 'HDL-C', kind: 'lab' },
    { factKey: 'triglycerides', zh: 'TG', en: 'TG', kind: 'lab' },
    { factKey: 'totalCholesterol', zh: 'TC', en: 'TC', kind: 'lab' },
    { factKey: 'lipoproteinA', zh: 'Lp(a)', en: 'Lp(a)', kind: 'lab' },
    { factKey: 'apolipoproteinB', zh: 'ApoB', en: 'ApoB', kind: 'lab' },
    { factKey: 'eGFR', zh: 'eGFR', en: 'eGFR', kind: 'lab' },
    { factKey: 'HbA1c', zh: 'HbA1c', en: 'HbA1c', kind: 'lab' },
    { factKey: 'bloodPressure', zh: '血壓', en: 'BP', kind: 'measure' },
  ],
  metricColumnsClass: 'grid-cols-3 @min-[30rem]:grid-cols-4 @min-[46rem]:grid-cols-5',
  // All tiles open the same therapy reconciliation. Their order groups
  // medication evidence; clinical nonstatin choice has no mandatory sequence.
  pillars: {
    shape: 'row',
    moduleId: 'dyslipidemia-lipid-lowering-therapy',
    sequence: false,
    rows: [
      { id: 'statinTherapy', zh: 'Statin', en: 'Statin', noteFactKey: 'statinAllergy' },
      { id: 'ezetimibeTherapy', zh: 'Ezetimibe', en: 'Ezetimibe' },
      { id: 'pcsk9Therapy', zh: 'PCSK9 抑制劑', en: 'PCSK9 inhibitor' },
    ],
  },
  pillarSectionLabel: { zh: '降脂治療核對', en: 'Lipid-lowering therapy' },
  pillarSectionKicker: { zh: '治療決策', en: 'Treatment decisions' },
  pillarFallbackTitle: { zh: '降脂治療核對', en: 'Lipid-lowering reconciliation' },
  // The lipid pack has no "are the inputs usable" module to print as a footer:
  // the monitoring module answers a different question (what to re-order) and
  // stays in the list, where its own next steps are readable.
  showCoverage: true,
  // The risk module reads a blood pressure, so the cuff in the room can reach
  // the pack. Nothing else on this board is measured rather than ordered.
  clinicEntryFields: ['systolic', 'diastolic'],
}

/**
 * Reads the board out of a result. `undefined` for any pack that is not the
 * dyslipidemia pack, so every other pathway keeps the generic module table.
 */
export function buildDyslipidemiaBoard(
  result: CdssResult,
  locale: CdssLocale,
  now: Date = new Date(),
): DiseaseBoardModel | undefined {
  return buildDiseaseBoard(result, DYSLIPIDEMIA_BOARD_CONFIG, locale, now)
}
