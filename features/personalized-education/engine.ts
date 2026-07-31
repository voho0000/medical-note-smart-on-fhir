import { getEnabledDiseasePacks } from './disease-packs/registry'
import type { EducationPlan, PatientEducationContext } from './types'

export type PersonalizedEducationResult =
  | { plan: EducationPlan; reason: 'eligible-pack' }
  | { plan: null; reason: 'no-eligible-pack' }

export function buildPersonalizedEducation(
  context: PatientEducationContext,
): PersonalizedEducationResult {
  const pack = getEnabledDiseasePacks().find((candidate) => (
    candidate.isEligible(context)
  ))

  return pack
    ? { plan: pack.buildPlan(context), reason: 'eligible-pack' }
    : { plan: null, reason: 'no-eligible-pack' }
}
