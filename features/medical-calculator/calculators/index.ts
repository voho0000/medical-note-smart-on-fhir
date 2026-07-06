// Barrel: reassembles all category calculator arrays into CALCULATORS and
// re-exports the tag/info helpers. Consumers import from `./calculators` (or
// `../calculators`) exactly as before — this file replaced the old
// single-file calculators.ts.

import type { CalculatorDef } from '../types'
import { RENAL } from './renal'
import { HEPATIC } from './hepatic'
import { GI } from './gi'
import { ELECTROLYTE } from './electrolyte'
import { CARDIAC } from './cardiac'
import { PULMONARY } from './pulmonary'
import { HEME } from './heme'
import { NEURO } from './neuro'
import { MENTAL } from './mental'
import { GENERAL } from './general'

export const CALCULATORS: CalculatorDef[] = [
  ...RENAL,
  ...HEPATIC,
  ...GI,
  ...ELECTROLYTE,
  ...CARDIAC,
  ...PULMONARY,
  ...HEME,
  ...NEURO,
  ...MENTAL,
  ...GENERAL,
]

export { CALC_TAGS, getCalcTags } from './tags'
export type { CalcTags } from './tags'
export { CALC_INFO, getCalcInfo } from './info'
export type { CalcInfo } from './info'
export { CALC_SCORING, getCalcScoring } from './scoring'
export type { CalcScoring, ScoringFactor, ScoringGrid, GridColor } from './scoring'
