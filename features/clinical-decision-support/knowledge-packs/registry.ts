import type {
  CdssKnowledgeSourceId,
  CdssKnowledgePack,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
} from '../types'
import { ADA_2026_PACK } from './ada-2026'
import { TAIWAN_T2DM_2022_PACK } from './taiwan-t2dm-2022'
import { TAIWAN_NHI_DIABETES_PACK } from './taiwan-nhi-diabetes'
import { KDIGO_CKD_2024_PACK } from './kdigo-ckd-2024'
import { KDIGO_ANEMIA_2026_PACK } from './kdigo-anemia-2026'
import { TAIWAN_CKD_2025_PACK } from './taiwan-ckd-2025'

// Removing one pack from this registry cleanly removes its evaluation and UI
// column without changing patient facts, clinical-domain rules, or rendering.
const knowledgePacks: readonly CdssKnowledgePack[] = [
  ADA_2026_PACK,
  TAIWAN_T2DM_2022_PACK,
  TAIWAN_NHI_DIABETES_PACK,
  KDIGO_CKD_2024_PACK,
  KDIGO_ANEMIA_2026_PACK,
  TAIWAN_CKD_2025_PACK,
]

export function getEnabledKnowledgePacks(): readonly CdssKnowledgePack[] {
  return knowledgePacks.filter((pack) => pack.enabled)
}

export function attachKnowledgeAssessments(input: {
  profile: CdssPatientProfile
  locale: CdssLocale
  recommendations: readonly CdssRecommendation[]
  sourceIds?: readonly CdssKnowledgeSourceId[]
}): {
  recommendations: CdssRecommendation[]
  knowledgePacks: ReturnType<CdssKnowledgePack['metadata']>[]
} {
  const enabled = getEnabledKnowledgePacks().filter((pack) => (
    !input.sourceIds
    || input.sourceIds.includes(pack.metadata(input.locale).id)
  ))
  const sourceIds = input.sourceIds
  if (sourceIds) {
    enabled.sort((a, b) => (
      sourceIds.indexOf(a.metadata(input.locale).id)
      - sourceIds.indexOf(b.metadata(input.locale).id)
    ))
  }
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
