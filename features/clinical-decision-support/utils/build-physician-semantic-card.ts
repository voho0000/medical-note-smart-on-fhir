import type {
  CdssKnowledgeSourceKind,
  CdssLocale,
  CdssRecommendation,
  CdssSourceAssessmentStatus,
  CdssStatus,
  GuidelineReference,
} from '../types'

export interface PhysicianSemanticGuidelineRule {
  sourceId?: string
  sourceKind: CdssKnowledgeSourceKind
  sourceLabel: string
  sourceVersion: string
  sourceStatus?: CdssSourceAssessmentStatus
  reference: GuidelineReference
}

export interface PhysicianSemanticCard {
  id: string
  decisionQuestion: string
  applicabilityStatus: CdssStatus
  applicabilityLabel: string
  guidelineRecommendation: string
  eligibilityCriteria: readonly string[]
  patientData: CdssRecommendation['patientEvidence']
  decisionLogic: string
  clinicalConclusion: string
  limitations: readonly string[]
  /** Compatibility aliases retained for current renderers and integrations. */
  patientConclusion: string
  clinicalReasoning: string
  guidelineRules: readonly PhysicianSemanticGuidelineRule[]
  patientEvidence: CdssRecommendation['patientEvidence']
  missingData: readonly string[]
  nextActions: CdssRecommendation['nextActions']
  safetyBoundary: string
}

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function applicabilityLabel(locale: CdssLocale, status: CdssStatus): string {
  switch (status) {
    case 'actionable':
      return text(locale, '符合介入條件', 'Meets criteria')
    case 'needs-data':
      return text(locale, '資料不足', 'Data needed')
    case 'review':
      return text(locale, '需臨床確認', 'Clinical review')
    case 'no-action':
      return text(locale, '目前無需處理', 'No action needed')
  }
}

/**
 * Converts a rule-engine recommendation into the stable, physician-facing
 * semantics used by every decision card. Guideline criteria come from the
 * enabled knowledge packs; patient applicability remains the clinical rule
 * result and is never inferred from display text.
 */
export function buildPhysicianSemanticCard(
  recommendation: CdssRecommendation,
  locale: CdssLocale,
): PhysicianSemanticCard {
  const seenReferenceIds = new Set<string>()
  const guidelineRules: PhysicianSemanticGuidelineRule[] = []

  recommendation.sourceAssessments?.forEach((source) => {
    source.references.forEach((reference) => {
      if (seenReferenceIds.has(reference.id)) return
      seenReferenceIds.add(reference.id)
      guidelineRules.push({
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        sourceLabel: source.sourceLabel,
        sourceVersion: source.version,
        sourceStatus: source.status,
        reference,
      })
    })
  })

  recommendation.guidelineReferences.forEach((reference) => {
    if (seenReferenceIds.has(reference.id)) return
    seenReferenceIds.add(reference.id)
    guidelineRules.push({
      sourceKind: 'guideline',
      sourceLabel: reference.publisher,
      sourceVersion: reference.version,
      reference,
    })
  })

  const primaryGuidelineSummary = guidelineRules.find(
    (rule) => rule.sourceKind === 'guideline',
  )?.reference.summary ?? guidelineRules[0]?.reference.summary
  const semanticRule = recommendation.semanticRule
  const guidelineRecommendation = semanticRule?.guidelineRecommendation
    ?? primaryGuidelineSummary
    ?? recommendation.rationale
  const eligibilityCriteria = semanticRule?.eligibilityCriteria
    ?? [guidelineRecommendation]
  const patientData = semanticRule?.patientData ?? recommendation.patientEvidence
  const decisionLogic = semanticRule?.decisionLogic ?? recommendation.rationale
  const clinicalConclusion = semanticRule?.clinicalConclusion ?? recommendation.recommendation
  const limitations = semanticRule?.limitations ?? [recommendation.safetyBoundary]

  return {
    id: recommendation.id,
    decisionQuestion: recommendation.title,
    applicabilityStatus: recommendation.status,
    applicabilityLabel: applicabilityLabel(locale, recommendation.status),
    guidelineRecommendation,
    eligibilityCriteria,
    patientData,
    decisionLogic,
    clinicalConclusion,
    limitations,
    patientConclusion: clinicalConclusion,
    clinicalReasoning: decisionLogic,
    guidelineRules,
    patientEvidence: recommendation.patientEvidence,
    missingData: recommendation.missingData ?? [],
    nextActions: recommendation.nextActions,
    safetyBoundary: recommendation.safetyBoundary,
  }
}
