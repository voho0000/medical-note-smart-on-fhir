import type { CdssLocale, CdssPatientProfile, CdssResult, CdssStatus } from '../types'
import { buildStatusMetric, type StatusMetricConfig } from './status-metrics'

/** Placement only: the pack remains the authority for every clinical judgement. */
export interface DiseaseBoardConfig {
  packId: string
  metrics: readonly StatusMetricConfig[]
  alertStatuses?: readonly CdssStatus[]
  headlineModuleId?: string
  /** Shape (b): multiple therapy facts belong to one recommendation. */
  therapy?: { moduleId: string; factKeys: readonly string[] }
}

export function buildDiseaseBoard(
  result: CdssResult,
  config: DiseaseBoardConfig,
  locale: CdssLocale,
  now: Date = new Date(),
  facts?: CdssPatientProfile['facts'],
) {
  if (result.packId !== config.packId) return undefined
  const recommendations = [...new Map([
    ...result.recommendations,
    ...(result.automatedChecks ?? []).flatMap((check) => check.recommendation ? [check.recommendation] : []),
  ].map((item) => [item.id, item])).values()]
  const byId = new Map(recommendations.map((item) => [item.id, item]))
  const metrics = config.metrics.map((metric) => buildStatusMetric(metric, recommendations, facts, locale === 'en', now))
  const priorityRank = { high: 0, medium: 1, routine: 2 }
  const alerts = recommendations.filter((item) => item.domain === 'safety' && (config.alertStatuses ?? ['actionable']).includes(item.status))
  const headlines = recommendations
    .filter((item) => (item.status === 'actionable' || item.status === 'needs-data') && item.nextActions[0])
    .sort((a, b) => Number(a.status !== 'actionable') - Number(b.status !== 'actionable')
      || priorityRank[a.priority] - priorityRank[b.priority]
      || (a.moduleOrder ?? Number.MAX_SAFE_INTEGER) - (b.moduleOrder ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 3)
    .map((item) => ({ recommendation: item, action: item.nextActions[0], reason: item.title, moduleName: item.moduleName ?? item.id }))
  const statusCounts: Record<CdssStatus, number> = { actionable: 0, 'needs-data': 0, review: 0, 'no-action': 0 }
  recommendations.forEach((item) => { statusCounts[item.status] += 1 })
  const therapyRecommendation = config.therapy ? byId.get(config.therapy.moduleId) : undefined
  const therapies = (config.therapy?.factKeys ?? []).flatMap((key) => {
    const evidence = therapyRecommendation?.patientEvidence.find((item) => item.factKeys.includes(key))
    return evidence ? [{ factKey: key, evidence }] : []
  })
  return { recommendations, byId, metrics, alerts, headlines, statusCounts, therapies, therapyRecommendation,
    headline: config.headlineModuleId ? byId.get(config.headlineModuleId) : undefined }
}

export type DiseaseBoardModel = NonNullable<ReturnType<typeof buildDiseaseBoard>>
