import type {
  CdssClinicalModule,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
  CdssScreeningId,
  ClinicalEvidence,
} from '../types'

const VACCINES: readonly {
  id: CdssScreeningId
  factKey: string
  zh: string
  en: string
}[] = [
  { id: 'influenza-vaccine', factKey: 'influenzaVaccine', zh: '流感', en: 'Influenza' },
  { id: 'covid-vaccine', factKey: 'covidVaccine', zh: 'COVID-19', en: 'COVID-19' },
  { id: 'pneumococcal-vaccine', factKey: 'pneumococcalVaccine', zh: '肺炎鏈球菌', en: 'Pneumococcal' },
]

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function evidence(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): ClinicalEvidence[] {
  return VACCINES.flatMap((vaccine): ClinicalEvidence[] => {
    const fact = profile.facts[vaccine.factKey]
    if (!fact) return []
    return [{
      label: text(locale, vaccine.zh, vaccine.en),
      value: fact[locale === 'en' ? 'en' : 'zh'],
      factKeys: [vaccine.factKey],
      sources: fact.sources,
    }]
  })
}

function buildImmunizationRecommendation(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const contexts = VACCINES.map((vaccine) => ({
    ...vaccine,
    context: profile.screeningContexts?.[vaccine.id],
  }))
  const needsReview = contexts.filter(({ context }) => context?.state !== 'current')
  const patientEvidence = evidence(profile, locale)
  const isComplete = needsReview.length === 0

  return {
    id: 'immunization-review',
    domain: 'care-gap',
    priority: 'routine',
    status: isComplete ? 'no-action' : 'needs-data',
    overviewEvidenceFactKey: patientEvidence[0]?.factKeys[0],
    hideNarrative: true,
    title: isComplete
      ? text(locale, '流感、COVID-19 與肺炎鏈球菌疫苗紀錄已核對', 'Influenza, COVID-19, and pneumococcal vaccine records checked')
      : text(
          locale,
          `疫苗紀錄待核對：${needsReview.map((item) => text(locale, item.zh, item.en)).join('、')}`,
          `Vaccine records to reconcile: ${needsReview.map((item) => text(locale, item.zh, item.en)).join(', ')}`,
        ),
    recommendation: isComplete
      ? text(
          locale,
          '目前資料中的三類疫苗紀錄均在本模組可判讀範圍；仍依當季公衛與院內建議核對追加劑。',
          'All three vaccine categories are evaluable in the available record; continue to follow current public-health and institutional booster guidance.',
        )
      : text(
          locale,
          '先查疾病管制署、院內與跨院接種紀錄；確認真的到期後，再依年齡、既往劑型與當季政策安排。',
          'First reconcile national, institutional, and cross-facility immunization records. If truly due, schedule according to age, prior products, and current seasonal policy.',
        ),
    rationale: text(
      locale,
      '疫苗時程取決於年齡、既往劑型與當季政策；資料切片未見紀錄不能直接判定未接種。',
      'Vaccine timing depends on age, prior products, and current seasonal policy; absence from this data slice does not prove nonvaccination.',
    ),
    patientEvidence,
    missingData: needsReview.map(({ context, zh, en }) => (
      context?.state === 'missing'
        ? text(locale, `${zh}疫苗完整接種紀錄`, `Complete ${en.toLowerCase()} vaccination record`)
        : text(locale, `${zh}疫苗劑型、序列與是否需追加`, `${en} product, series, and booster need`)
    )),
    nextActions: [
      isComplete
        ? text(locale, '依當季政策例行更新，不需另佔門診決策列。', 'Update routinely under current seasonal policy; no separate visit action is needed.')
        : text(locale, '先查完整接種史；只對確認到期的疫苗安排補接種。', 'Reconcile the complete vaccination history and schedule only vaccines confirmed due.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組不依缺少紀錄直接宣告未接種，也不取代疫苗禁忌、過敏與當季政策核對。',
      'This module does not infer nonvaccination from a missing record and does not replace review of contraindications, allergies, or current seasonal policy.',
    ),
  }
}

export const IMMUNIZATION_CLINICAL_MODULE: CdssClinicalModule = {
  id: 'immunization-review',
  enabled: true,
  build({ profile, locale }) {
    return buildImmunizationRecommendation(profile, locale)
  },
}
