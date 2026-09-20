import { createFhirCdssPatientProfile, type FhirCdssProfileInput } from '@voho0000/personalized-care-fhir'
import { HYPERLIPIDEMIA_GUIDELINE_PACK, type CdssPatientProfile, type CdssCoverageCheck } from '@voho0000/personalized-care'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import { buildSourceCatalog, type SummaryCatalogInput } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import { parseNhiLipidAiResponse, selectNhiLipidAiCriteria } from '@/features/clinical-decision-support/ai/nhi-lipid-ai-assist'

export type FixtureAnswer = 'yes' | 'no' | 'unknown'
export interface LipidPipelineCase {
  id: string
  label: string
  expected: { baselineTier: string | null; acceptedAiTier: string | null; physicianTier: string | null }
  aiAnswers: Record<string, FixtureAnswer>
  aiEvidence: Record<string, string>
  physicianAnswers: Record<string, FixtureAnswer>
  profilePatch?: Partial<CdssPatientProfile>
  profileInput: Omit<FhirCdssProfileInput, 'now'>
}

export function buildFixtureProfile(scenario: LipidPipelineCase, fixedNow: string): CdssPatientProfile {
  return {
    ...createFhirCdssPatientProfile({ ...scenario.profileInput, now: new Date(fixedNow) }),
    ...scenario.profilePatch,
  }
}

export function fixtureSummary(profile: CdssPatientProfile) {
  return HYPERLIPIDEMIA_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
    .recommendations.find(item => item.id === 'dyslipidemia-risk-and-target')!.coverageSummary!
}

export function fixtureChecks(profile: CdssPatientProfile): CdssCoverageCheck[] {
  const summary = fixtureSummary(profile)
  return selectNhiLipidAiCriteria([...summary.factors, ...summary.metabolicChecks, ...summary.diseaseChecks])
}

export function fixtureCatalog(scenario: LipidPipelineCase): SummarySourceCatalogEntry[] {
  return buildSourceCatalog(scenario.profileInput as unknown as SummaryCatalogInput, 'zh-TW')
}

/** Deterministic synthetic model reply, through the production source parser.
 * This validates integration, not a live model's clinical extraction accuracy. */
export function replayFixtureReply(
  scenario: LipidPipelineCase,
  criteria: readonly CdssCoverageCheck[],
  fixedNow: string,
  unknownOnly = false,
) {
  const catalog = fixtureCatalog(scenario)
  const clinicalContext = catalog.map(source => `${source.key}: ${source.getContentText?.() ?? ''}`).join('\n\n')
  const raw = JSON.stringify({ suggestions: criteria.map(criterion => {
    const state = unknownOnly ? 'unknown' : scenario.aiAnswers[criterion.id] ?? 'unknown'
    const excerpt = scenario.aiEvidence?.[criterion.id]
    const source = excerpt && catalog.find(entry => entry.getContentText?.().includes(excerpt))
    if (state !== 'unknown' && !source) throw new Error(`Synthetic ${scenario.id}/${criterion.id} has no source-specific evidence`)
    return {
      criterionId: criterion.id,
      state,
      confidence: state === 'unknown' ? 'low' : 'high',
      rationale: state === 'unknown' ? '合成資料不足以確認此條件。' : '合成回覆引用此病人的指定原始報告。',
      missing: state === 'unknown' ? ['需進一步確認病史或檢查資料'] : [],
      evidence: state !== 'unknown' && source ? [{ source: source.key, excerpt }] : [],
    }
  }) })
  const parsed = parseNhiLipidAiResponse({
    raw, criteria, clinicalContext, catalog,
    modelId: 'synthetic-pipeline-replay', modelName: '合成回覆重播（無外部 AI 呼叫）', generatedAt: fixedNow,
  })
  if (!parsed) throw new Error('Synthetic reply failed the production parser')
  return parsed
}
