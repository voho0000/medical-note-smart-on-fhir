import { getEnabledDiseasePacks } from './disease-packs/registry'
import type { DiseaseEducationPack, EducationPlan, PatientEducationContext } from './types'

export type PersonalizedEducationResult =
  | {
    plan: EducationPlan
    reason: 'eligible-pack'
    /** Every pack that matched, selected one first. */
    eligiblePackIds: string[]
  }
  | { plan: null; reason: 'no-eligible-pack'; eligiblePackIds: [] }

/**
 * Order packs are considered in when a patient matches more than one.
 *
 * Only one plan is rendered today, and with a single registered pack that is
 * not a limitation. It becomes one the moment a second pack ships, so the
 * choice is stated here rather than left to registration order, and every match
 * is reported so a comorbid patient silently seeing one disease is detectable
 * instead of invisible.
 */
const PACK_PRIORITY: readonly string[] = ['dm']

function byPriority(left: DiseaseEducationPack, right: DiseaseEducationPack): number {
  const rank = (pack: DiseaseEducationPack) => {
    const index = PACK_PRIORITY.indexOf(pack.id)
    return index === -1 ? Number.MAX_SAFE_INTEGER : index
  }
  return rank(left) - rank(right) || left.id.localeCompare(right.id)
}

export function buildPersonalizedEducation(
  context: PatientEducationContext,
): PersonalizedEducationResult {
  const eligible = getEnabledDiseasePacks()
    .filter((candidate) => candidate.isEligible(context))
    .sort(byPriority)

  const [selected] = eligible
  if (!selected) return { plan: null, reason: 'no-eligible-pack', eligiblePackIds: [] }

  return {
    plan: selected.buildPlan(context),
    reason: 'eligible-pack',
    eligiblePackIds: eligible.map((pack) => pack.id),
  }
}
