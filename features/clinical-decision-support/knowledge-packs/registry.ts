import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
} from '../types'
import { ADA_2026_PACK } from './ada-2026'
import { TAIWAN_T2DM_2022_PACK } from './taiwan-t2dm-2022'
import { TAIWAN_NHI_DIABETES_PACK } from './taiwan-nhi-diabetes'

// Removing one pack from this registry cleanly removes its evaluation and UI
// column without changing patient facts, clinical-domain rules, or rendering.
const knowledgePacks: readonly CdssKnowledgePack[] = [
  ADA_2026_PACK,
  TAIWAN_T2DM_2022_PACK,
  TAIWAN_NHI_DIABETES_PACK,
]

export function getEnabledKnowledgePacks(): readonly CdssKnowledgePack[] {
  return knowledgePacks.filter((pack) => pack.enabled)
}

export function attachKnowledgeAssessments(input: {
  profile: CdssPatientProfile
  locale: CdssLocale
  recommendations: readonly CdssRecommendation[]
}): {
  recommendations: CdssRecommendation[]
  knowledgePacks: ReturnType<CdssKnowledgePack['metadata']>[]
} {
  const enabled = getEnabledKnowledgePacks()
  return {
    knowledgePacks: enabled.map((pack) => pack.metadata(input.locale)),
    recommendations: input.recommendations.map((recommendation) => {
      if (recommendation.kind === 'risk-stratification') {
        return recommendation
      }
      return {
        ...recommendation,
        sourceAssessments: enabled.map((pack) => pack.assess({
          profile: input.profile,
          recommendation,
          locale: input.locale,
        })),
      }
    }),
  }
}
