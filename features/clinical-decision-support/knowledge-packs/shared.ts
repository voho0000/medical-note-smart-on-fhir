import type {
  CdssKnowledgeSourceId,
  CdssKnowledgeSourceKind,
  CdssLocale,
  CdssSourceAssessment,
  CdssSourceAssessmentStatus,
  GuidelineReference,
} from '../types'

export function localize(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

export function assessment(input: {
  sourceId: CdssKnowledgeSourceId
  sourceKind: CdssKnowledgeSourceKind
  sourceLabel: string
  version: string
  effectiveFrom: string
  status: CdssSourceAssessmentStatus
  summary: string
  verifiedData?: readonly string[]
  missingData?: readonly string[]
  references?: readonly GuidelineReference[]
}): CdssSourceAssessment {
  return {
    ...input,
    references: input.references ?? [],
  }
}
