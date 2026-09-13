/**
 * The heart-failure visit, as a model.
 *
 * The model itself is no longer here: it is `visit-flow/build-visit-flow.ts`,
 * a disease-agnostic engine, and everything that made this file about heart
 * failure — the module ids, the congestion terms, the NYHA question, the
 * reasons a beta-blocker can be refused — is now
 * `HEART_FAILURE_VISIT_FLOW_CONFIG`. Dyslipidemia is the second config, and
 * the reason the two were separated at all.
 *
 * What stays here is the heart-failure entry point and the names every caller
 * and test already imports, so nothing outside this feature had to move.
 */
import { buildVisitFlow } from '../visit-flow/build-visit-flow'
import { HEART_FAILURE_VISIT_FLOW_CONFIG } from '../visit-flow/heart-failure-visit-flow.config'
import type { CdssResult } from '../types'
import type { ClinicVitals } from '../stores/clinic-vitals.store'
import type { PhenotypeAnswer } from '../stores/phenotype-answer.store'
import type { PhysicianDecisionMap } from '../stores/physician-decisions.store'
import type { HeartFailureBoardModel } from './heart-failure-board'
import type { VisitFlowModel } from '../visit-flow/types'

export {
  DECISION_LABELS,
  VISIT_DECISIONS,
  decisionLabel,
  formatDay,
  formatStamp,
} from '../visit-flow/build-visit-flow'
export {
  DECISION_REASONS,
  VISIT_EXAM_ITEMS,
  VISIT_SIDE_LABELS,
  VISIT_SYMPTOM_ITEMS,
  decisionReasonIds,
  visitQuestionForSignTerm,
  type VisitSignSide,
} from '../visit-flow/heart-failure-visit-flow.config'
export type {
  CarriedField,
  VisitActionGroup,
  VisitActionGroupId,
  VisitActionRow,
  VisitDecisionKind,
  VisitItem as VisitSignItem,
  VisitNextStep,
  VisitNextStepTarget,
  VisitNextStepTone,
  VisitQuestion,
  VisitQuestionId,
  VisitQuestionState,
  VisitStep,
  VisitStepState,
  VisitFlowModel as HeartFailureVisitFlow,
} from '../visit-flow/types'

import { DECISION_REASONS } from '../visit-flow/heart-failure-visit-flow.config'
import { decisionReasonLabel as reasonLabel } from '../visit-flow/build-visit-flow'

/** The heart-failure wording for a reason id, or the id when it names none. */
export function decisionReasonLabel(id: string, isEnglish: boolean): string {
  return reasonLabel(DECISION_REASONS, id, isEnglish)
}

/** The four steps this pathway is read in, for a caller that names one. */
export type VisitStepId = 'confirm' | 'assess' | 'act' | 'record'

export interface HeartFailureVisitFlowInput {
  board: HeartFailureBoardModel
  result: CdssResult
  isEnglish: boolean
  now: Date
  clinicVitals?: ClinicVitals
  phenotypeAnswer?: PhenotypeAnswer
  decisions: PhysicianDecisionMap
  /** Absent while no patient is loaded. */
  patientId?: string
}

/**
 * Reads the visit out of the heart-failure board, the pack result and what
 * this browser has recorded.
 *
 * The board arrives as the heart-failure model it is; the engine reads the
 * three fields every board carries (the framing number, the alerts, the
 * treatment tracks) and the heart-failure config reads the rest off the same
 * object. `headlineMetric` is the LVEF under the name the engine knows it by.
 */
export function buildHeartFailureVisitFlow(
  input: HeartFailureVisitFlowInput,
): VisitFlowModel {
  return buildVisitFlow(
    {
      ...input,
      board: {
        ...input.board,
        ...(input.board.lvef ? { headlineMetric: input.board.lvef } : {}),
        ...(input.board.phenotype?.title ? { subtitle: input.board.phenotype.title } : {}),
      },
    },
    HEART_FAILURE_VISIT_FLOW_CONFIG,
  )
}
