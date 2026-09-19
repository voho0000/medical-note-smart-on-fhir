import { DECISION_LABELS } from './heart-failure-visit-flow'
import type { PhysicianDecisionMap } from '../stores/physician-decisions.store'
import type { CdssLocale, CdssPatientProfile, CdssResult, CdssStatus } from '../types'

export interface DiseaseBoardConfig {
  packId: string
  headlineId: string
  metrics: readonly { key: string; zh: string; en: string }[]
}
export const AF_BOARD_CONFIG: DiseaseBoardConfig = {
  packId: 'atrial-fibrillation-cdss',
  headlineId: 'af-documented-cha2ds2-vasc',
  metrics: [
    { key: 'heartRate', zh: '心率', en: 'Heart rate' },
    { key: 'bloodPressure', zh: '血壓', en: 'BP' },
    { key: 'LVEF', zh: 'LVEF', en: 'LVEF' },
    { key: 'bodyWeight', zh: '體重', en: 'Weight' },
    { key: 'serumCreatinine', zh: 'Cr', en: 'Cr' },
    { key: 'eGFR', zh: 'eGFR', en: 'eGFR' },
    { key: 'hemoglobin', zh: 'Hb', en: 'Hb' },
    { key: 'plateletCount', zh: 'Platelet', en: 'Platelets' },
  ],
}
const STATUS_ORDER: CdssStatus[] = ['actionable', 'needs-data', 'review', 'no-action']

/** Placement only. Values, statuses, clinical thresholds and next steps belong to the pack. */
export function buildDiseaseBoard(
  result: CdssResult,
  config: DiseaseBoardConfig,
  locale: CdssLocale,
  facts?: CdssPatientProfile['facts'],
) {
  if (result.packId !== config.packId) return undefined
  const items = result.recommendations
  const alerts = items.filter((r) => r.domain === 'safety' && r.status === 'actionable' && r.priority === 'high')
  const alertIds = new Set(alerts.map((r) => r.id))
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: items.filter((r) => r.status === status && !alertIds.has(r.id)),
  })).filter((g) => g.items.length)
  const metrics = config.metrics.map((metric) => {
    const evidence = items.flatMap((r) => r.patientEvidence).find((e) => e.factKeys.includes(metric.key))
    const row = items
      .flatMap((r) => r.evidenceTables?.flatMap((t) => t.items) ?? [])
      .find((r) => r.id === `af-measure:${metric.key}`)
    const fact = facts?.[metric.key]
    return {
      key: metric.key,
      label: locale === 'en' ? metric.en : metric.zh,
      value: (evidence?.value ?? fact?.[locale === 'en' ? 'en' : 'zh'])
        ?.replace(/[（(]\d{4}-\d{2}-\d{2}[）)]/g, '')
        .trim(),
      date: fact?.date ?? row?.date,
      stale: Boolean(row?.value && /超過 \d+ 天窗|past \d+-day window/.test(row.value)),
    }
  })
  return {
    headline: items.find((r) => r.id === config.headlineId),
    alerts,
    groups,
    metrics,
    consumedIds: new Set(items.map((r) => r.id)),
    items,
  }
}
export type DiseaseBoardModel = NonNullable<ReturnType<typeof buildDiseaseBoard>>
export function afSummary(
  result: CdssResult,
  decisions: PhysicianDecisionMap,
  locale: CdssLocale,
): string {
  return [
    result.title,
    `${locale === 'en' ? 'Rule version' : '規則版本'} ${result.packVersion}`,
    ...result.recommendations.map(
      (r) =>
        `${r.moduleName ?? r.id}：${r.title}\n${r.recommendation}${decisions[r.id] ? `\n${locale === 'en' ? 'Recorded decision' : '已記錄處置'}：${DECISION_LABELS[decisions[r.id].decision][locale === 'en' ? 'en' : 'zh']}${decisions[r.id].note ? ` · ${decisions[r.id].note}` : ''}` : ''}`,
    ),
  ].join('\n\n')
}
