/**
 * Which packs the visit flow can draw, and with what.
 *
 * The one place dispatch asks 「does this pathway have a visit flow?」. It used
 * to ask 「is this the heart-failure pack?」 in four places, which is why adding
 * a second disease meant editing four files instead of adding a line here.
 */
import { HEART_FAILURE_VISIT_FLOW_CONFIG } from './heart-failure-visit-flow.config'
import { DYSLIPIDEMIA_VISIT_FLOW_CONFIG } from './dyslipidemia-visit-flow.config'
import type { VisitFlowDiseaseConfig } from './types'

export const VISIT_FLOW_CONFIGS: Readonly<Record<string, VisitFlowDiseaseConfig>> = {
  [HEART_FAILURE_VISIT_FLOW_CONFIG.packId]: HEART_FAILURE_VISIT_FLOW_CONFIG,
  [DYSLIPIDEMIA_VISIT_FLOW_CONFIG.packId]: DYSLIPIDEMIA_VISIT_FLOW_CONFIG,
}

/** The config for one pack, or `undefined` for a pathway that has no flow. */
export function visitFlowConfigFor(packId: string | undefined): VisitFlowDiseaseConfig | undefined {
  return packId ? VISIT_FLOW_CONFIGS[packId] : undefined
}

/** Whether this pathway draws the visit flow at all. */
export function hasVisitFlow(packId: string | undefined): boolean {
  return Boolean(visitFlowConfigFor(packId))
}
