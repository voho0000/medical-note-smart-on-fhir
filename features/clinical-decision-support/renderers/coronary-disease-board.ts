import type { CdssLocale, CdssPatientProfile, CdssRecommendation, CdssResult } from '../types'
import type { PhysicianDecisionMap } from '../stores/physician-decisions.store'
import type { VisitActionRow } from './heart-failure-visit-flow'
import { buildDiseaseBoard, compactValue, daysBetween, latestSourceDate, TAKING_PATTERN, type DiseaseBoardConfig } from './disease-board'

export const CORONARY_DISEASE_PACK_ID = 'chronic-coronary-disease-cdss'
const CORONARY_CONFIG: DiseaseBoardConfig = {
  packId: CORONARY_DISEASE_PACK_ID,
  headlineModuleId: 'coronary-disease-evidence',
  metrics: [
    { factKey: 'LDL', zh: 'LDL-C', en: 'LDL-C', kind: 'lab' },
    { factKey: 'LVEF', zh: 'LVEF', en: 'LVEF', kind: 'lab' },
    { factKey: 'bloodPressure', zh: '血壓', en: 'BP', kind: 'measure' },
    { factKey: 'heartRate', zh: '心率', en: 'HR', kind: 'measure' },
    { factKey: 'eGFR', zh: 'eGFR', en: 'eGFR', kind: 'lab' },
    { factKey: 'potassium', zh: 'K', en: 'K', kind: 'lab' },
    { factKey: 'hemoglobin', zh: 'Hb', en: 'Hb', kind: 'lab' },
  ],
}

const THERAPY_GROUPS = [
  { id: 'coronary-antiplatelet-strategy', zh: '抗栓治療', en: 'Antithrombotic therapy', drugs: [
    { factKey: 'aspirinTherapy', label: 'Aspirin' },
    { factKey: 'p2y12Therapy', label: 'P2Y12 inhibitor' },
    { factKey: 'currentOralAnticoagulant', label: 'OAC', presenceMeansCurrent: true },
  ] },
  { id: 'coronary-lipid-lowering', zh: '降脂治療', en: 'Lipid lowering', drugs: [
    { factKey: 'statinTherapy', label: 'Statin' },
    { factKey: 'ezetimibeTherapy', label: 'Ezetimibe' },
    { factKey: 'pcsk9Therapy', label: 'PCSK9 inhibitor' },
  ] },
] as const

export interface CoronaryDrugCell {
  factKey: string
  label: string
  /** Prescription state only. A group's verdict never becomes a drug's verdict. */
  taking: boolean | undefined
  text?: string
}
export interface CoronaryTherapyGroup {
  id: string
  label: string
  recommendation: CdssRecommendation
  drugs: readonly CoronaryDrugCell[]
}

export function coronaryActionRow(recommendation: CdssRecommendation, decisions: PhysicianDecisionMap): VisitActionRow {
  return {
    recommendation,
    headline: recommendation.title,
    moduleName: recommendation.moduleName ?? recommendation.title,
    status: recommendation.status,
    isSafety: recommendation.domain === 'safety' && recommendation.status === 'actionable',
    decisionKind: recommendation.status === 'no-action' || recommendation.domain === 'diagnosis'
      ? 'none'
      : recommendation.status === 'needs-data' || recommendation.domain === 'monitoring' || recommendation.domain === 'care-gap'
        ? 'test' : 'medication',
    decision: decisions[recommendation.id],
  }
}

/** Layout only: no diagnostic, LDL, or DAPT thresholds are evaluated here. */
export function buildCoronaryDiseaseBoard(
  result: CdssResult, locale: CdssLocale, now = new Date(),
  profileFacts?: CdssPatientProfile['facts'],
) {
  const common = buildDiseaseBoard(result, CORONARY_CONFIG, locale, now, profileFacts)
  if (!common) return undefined
  const isEnglish = locale === 'en'
  const groups: CoronaryTherapyGroup[] = THERAPY_GROUPS.flatMap(config => {
    const recommendation = common.byId.get(config.id)
    if (!recommendation) return []
    return [{
      id: config.id, label: isEnglish ? config.en : config.zh, recommendation,
      drugs: config.drugs.map(drug => {
        const evidence = recommendation.patientEvidence.find(item => item.factKeys.length === 1 && item.factKeys[0] === drug.factKey)
        const fact = profileFacts?.[drug.factKey]
        const text = evidence?.value ?? (isEnglish ? fact?.en : fact?.zh)
        // The adapter emits currentOralAnticoagulant only for a current OAC.
        // With no complete profile the absent row remains unknown.
        const taking = text
          ? ('presenceMeansCurrent' in drug || TAKING_PATTERN.test(text))
          : 'presenceMeansCurrent' in drug && profileFacts?.medicationListOverview ? false : undefined
        return { factKey: drug.factKey, label: drug.label, taking, text }
      }),
    }]
  })
  const events = [
    { factKey: 'acuteCoronarySyndromeAdmission', zh: 'ACS 住院', en: 'ACS admission' },
    { factKey: 'pciDate', zh: 'PCI', en: 'PCI' },
  ].flatMap(config => {
    const fact = profileFacts?.[config.factKey]
    const evidence = common.recommendations.flatMap(item => item.patientEvidence)
      .find(item => item.factKeys.length === 1 && item.factKeys[0] === config.factKey)
    const text = isEnglish ? fact?.en : fact?.zh
    const date = fact?.date ?? latestSourceDate(evidence) ?? compactValue(text ?? evidence?.value ?? '').inlineDate
    if (!date || !Number.isFinite(Date.parse(date)) || Date.parse(date) > now.getTime()) return []
    return [{ ...config, label: isEnglish ? config.en : config.zh, date: date.slice(0, 10), ageDays: daysBetween(date, now) }]
  })
  const consumedIds = new Set([
    ...(common.headline ? [common.headline.id] : []),
    ...common.alerts.map(item => item.id), ...groups.map(item => item.id),
  ])
  const rank = { actionable: 0, 'needs-data': 1, review: 2, 'no-action': 3 }
  const priority = { high: 0, medium: 1, routine: 2 }
  const remaining = common.recommendations.filter(item => !consumedIds.has(item.id))
    .sort((a, b) => rank[a.status] - rank[b.status] || priority[a.priority] - priority[b.priority]
      || (a.moduleOrder ?? 0) - (b.moduleOrder ?? 0))
  return { ...common, groups, events, remaining, consumedIds, patientContext: result.patientContext }
}

export type CoronaryDiseaseBoardModel = NonNullable<ReturnType<typeof buildCoronaryDiseaseBoard>>
