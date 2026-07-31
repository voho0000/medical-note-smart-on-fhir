import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssRecommendation,
  CdssPatientProfile,
  GuidelineReference,
} from '../types'
import { assessment, localize } from './shared'

const PRIMARY_GUIDELINE_URL = 'https://www.tas.org.tw/upload/files/1-s2_0-S0929664622002157-main%20%281%29.pdf'
const HIGH_RISK_UPDATE_URL = 'https://www.tas.org.tw/upload/files/1-s2_0-S0929664622001036-main.pdf'

function reference(input: {
  locale: CdssLocale
  id: string
  document: 'primary' | 'high-risk'
  page: number
  recommendationId: string
  evidenceGrade?: string
  locatorZh: string
  locatorEn: string
  summaryZh: string
  summaryEn: string
}): GuidelineReference {
  const primary = input.document === 'primary'
  return {
    id: `TW-LIPID-2022-${input.id}`,
    title: localize(
      input.locale,
      primary
        ? '2022 台灣初級預防血脂指引'
        : '2022 台灣高風險血脂指引聚焦更新',
      primary
        ? '2022 Taiwan Lipid Guidelines for Primary Prevention'
        : '2022 Focused Update of the Taiwan Lipid Guidelines for High-Risk Patients',
    ),
    publisher: localize(
      input.locale,
      '台灣血脂及動脈硬化學會',
      'Taiwan Society of Lipids and Atherosclerosis',
    ),
    version: '2022',
    url: `${primary ? PRIMARY_GUIDELINE_URL : HIGH_RISK_UPDATE_URL}#page=${input.page}`,
    page: input.page,
    recommendationId: input.recommendationId,
    evidenceGrade: input.evidenceGrade,
    locator: localize(input.locale, input.locatorZh, input.locatorEn),
    summary: localize(input.locale, input.summaryZh, input.summaryEn),
  }
}

function primaryHighRiskReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'PRIMARY-HIGH-RISK',
    document: 'primary',
    page: 5,
    recommendationId: 'Primary prevention high-risk recommendations',
    evidenceGrade: 'COR I, LOE A/B',
    locatorZh: '高風險分層與 LDL-C 目標',
    locatorEn: 'High-risk classification and LDL-C goal',
    summaryZh: '糖尿病、非透析 CKD 或 LDL-C ≥190 mg/dL 屬高風險，應立即合併生活型態與降脂治療，LDL-C 目標 <100 mg/dL。',
    summaryEn: 'Diabetes, nondialysis CKD, or LDL-C ≥190 mg/dL defines high risk; start lifestyle plus lipid-lowering therapy immediately with an LDL-C goal <100 mg/dL.',
  })
}

function primaryTreatmentReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'PRIMARY-TREATMENT',
    document: 'primary',
    page: 10,
    recommendationId: 'Pharmacological therapy recommendations',
    evidenceGrade: 'COR I, LOE A / COR IIa–IIb, LOE B',
    locatorZh: '藥物治療 → statin、ezetimibe 與 PCSK9 抑制劑',
    locatorEn: 'Pharmacological therapy → statin, ezetimibe, and PCSK9 inhibitor',
    summaryZh: 'Statin 為初級預防第一線；未達標時可由中強度調至高強度，或依風險與耐受性加入 ezetimibe，再於高風險且最大耐受治療仍未達標時考慮 PCSK9 抑制劑。',
    summaryEn: 'Statins are first line in primary prevention; if the goal is not reached, intensify or add ezetimibe, and consider a PCSK9 inhibitor for high-risk patients not at goal despite maximally tolerated statin plus ezetimibe.',
  })
}

function secondaryTargetReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'SECONDARY-TARGET',
    document: 'high-risk',
    page: 3,
    recommendationId: 'ASCVD LDL-C target recommendations',
    evidenceGrade: 'COR I, LOE B / COR IIa, LOE B',
    locatorZh: 'ASCVD LDL-C 目標',
    locatorEn: 'ASCVD LDL-C goals',
    summaryZh: 'CAD／ACS 的 LDL-C 目標為 <70 mg/dL；近期或多次 MI、多血管床疾病、ACS 合併糖尿病等極高風險情境可考慮 <55 mg/dL。',
    summaryEn: 'The LDL-C goal for CAD/ACS is <70 mg/dL; <55 mg/dL can be considered with recent or multiple MI, polyvascular disease, ACS with diabetes, or another very-high-risk context.',
  })
}

function secondaryTherapyReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'SECONDARY-THERAPY',
    document: 'high-risk',
    page: 6,
    recommendationId: 'ASCVD LDL-C lowering algorithm / Table 1',
    evidenceGrade: 'COR IIa, LOE B',
    locatorZh: 'ASCVD 降脂治療流程與目標表',
    locatorEn: 'ASCVD lipid-lowering algorithm and target table',
    summaryZh: 'ASCVD 應以最大耐受 statin 為基礎；特定缺血性中風／TIA 未達 <70 mg/dL 時可加入 ezetimibe，仍未達標再評估 PCSK9 抑制劑。',
    summaryEn: 'Use maximally tolerated statin therapy as the ASCVD foundation; in eligible ischemic stroke/TIA, add ezetimibe to reach <70 mg/dL and assess a PCSK9 inhibitor if still above goal.',
  })
}

function markerReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'NON-HDL-APOB',
    document: 'primary',
    page: 10,
    recommendationId: 'Other lipid targets and residual risk',
    locatorZh: 'non-HDL-C 與 ApoB',
    locatorEn: 'Non-HDL-C and ApoB',
    summaryZh: 'non-HDL-C 為 LDL-C 後的次要目標，目標值高於 LDL-C 目標 30 mg/dL；ApoB 可在檢驗可近時選擇性評估。',
    summaryEn: 'Non-HDL-C is a secondary goal set 30 mg/dL above the LDL-C goal; ApoB may be assessed selectively when testing is available.',
  })
}

function references(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  recommendation: CdssRecommendation,
): GuidelineReference[] {
  switch (recommendation.id) {
    case 'dyslipidemia-severe-ldl':
      return [primaryHighRiskReference(locale), primaryTreatmentReference(locale)]
    case 'dyslipidemia-risk-and-target':
      return profile.facts.ascvdDiagnosis
        ? [secondaryTargetReference(locale), markerReference(locale)]
        : [primaryHighRiskReference(locale), markerReference(locale)]
    case 'dyslipidemia-lipid-lowering-therapy':
      return profile.facts.ascvdDiagnosis
        ? [secondaryTargetReference(locale), secondaryTherapyReference(locale)]
        : [primaryTreatmentReference(locale)]
    case 'dyslipidemia-monitoring-and-markers':
      return [markerReference(locale)]
    default:
      return []
  }
}

export const TAIWAN_LIPID_2022_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'taiwan-lipid-2022',
      kind: 'guideline',
      label: localize(locale, '台灣血脂指引', 'Taiwan lipid guidelines'),
      version: '2022',
      effectiveFrom: '2022-08-01',
    }
  },
  assess({ profile, recommendation, locale }) {
    const metadata = this.metadata(locale)
    const recommendationReferences = references(profile, locale, recommendation)
    const noSpecificRule = recommendationReferences.length === 0
    return assessment({
      sourceId: metadata.id,
      sourceKind: metadata.kind,
      sourceLabel: metadata.label,
      version: metadata.version,
      effectiveFrom: metadata.effectiveFrom,
      status: noSpecificRule
        ? 'no-special-rule'
        : recommendation.status === 'needs-data'
          ? 'needs-data'
          : recommendation.status === 'actionable'
            ? 'recommended'
            : 'consider',
      summary: noSpecificRule
        ? localize(
            locale,
            '本項安全問題以較新的國際血脂異常指引補充；台灣 2022 指引未在此模組使用特定自動門檻。',
            'This safety issue is supplemented by the newer international dyslipidemia guideline; no Taiwan 2022 automated threshold is applied here.',
          )
        : localize(
            locale,
            '以台灣 2022 初級預防與高風險聚焦更新的 LDL-C 目標及階梯式治療架構評估。',
            'Assess using the LDL-C goals and stepwise treatment framework from the 2022 Taiwan primary-prevention guideline and high-risk focused update.',
          ),
      missingData: recommendation.status === 'needs-data'
        ? recommendation.missingData
        : undefined,
      references: recommendationReferences,
    })
  },
}
