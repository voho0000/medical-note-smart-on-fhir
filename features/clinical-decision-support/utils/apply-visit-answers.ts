/**
 * Puts what the clinician answered in the room into the profile the pack reads.
 *
 * The same route `apply-clinic-vitals.ts` takes, and for the same reason: an
 * answer is a fact on the profile, so every module that reads it recomputes
 * and nothing patches a rendered card. What each answer becomes is the
 * disease's own business, so it is the question spec's `toFacts` that writes
 * it; this file only walks the config and merges.
 *
 * Nothing here judges. 「未評估」 and 「沒問」 both produce no fact — the pack
 * must not read either as a negative finding — and only 「無」 is a negation,
 * carried as its own term.
 */
import type { CdssFact, CdssLocale, CdssPatientProfile } from '../types'
import type { VisitAnswers } from '../stores/visit-answers.store'
import type { VisitFlowDiseaseConfig } from '../visit-flow/types'

export function applyVisitAnswers(
  profile: CdssPatientProfile,
  answers: VisitAnswers | undefined,
  config: VisitFlowDiseaseConfig | undefined,
  locale: CdssLocale = 'zh-TW',
): CdssPatientProfile {
  if (!answers || !config) return profile
  const facts: Record<string, CdssFact> = {}
  for (const spec of config.questions) {
    if (!spec.toFacts) continue
    Object.assign(facts, spec.toFacts(answers[spec.id], { isEnglish: locale === 'en', locale }))
  }
  if (Object.keys(facts).length === 0) return profile
  return { ...profile, facts: { ...profile.facts, ...facts } }
}
