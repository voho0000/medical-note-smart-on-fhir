import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssRecommendation,
  GuidelineReference,
} from '../types'
import { assessment, localize } from './shared'

const GUIDELINE_HUB_URL = 'https://professional.heart.org/en/guidelines-statements/2026-accahaaacvprabcacpmadaagsaphaaspcnlapcna-guideline-on-the-management-ofcir0000000000001423'
const TOP_THINGS_URL = 'https://professional.heart.org/en/science-news/2026-guideline-on-the-management-of-dyslipidemia/top-things-to-know'
const PREVENT_MESSAGES_URL = 'https://professional.heart.org/en/-/media/PHD-Files-2/Science-News/t/Top-Take-Home-Messages-for-Clinicians-Using-PREVENT-ASCVD-Equations.pdf'

function reference(input: {
  locale: CdssLocale
  id: string
  url?: string
  page?: number
  recommendationId: string
  locatorZh: string
  locatorEn: string
  summaryZh: string
  summaryEn: string
}): GuidelineReference {
  const url = input.url ?? TOP_THINGS_URL
  return {
    id: `AHA-ACC-LIPID-2026-${input.id}`,
    title: '2026 ACC/AHA Guideline on the Management of Dyslipidemia',
    publisher: 'American Heart Association / American College of Cardiology',
    version: '2026',
    url: input.page ? `${url}#page=${input.page}` : url,
    directLink: !input.page,
    page: input.page,
    recommendationId: input.recommendationId,
    locator: localize(input.locale, input.locatorZh, input.locatorEn),
    summary: localize(input.locale, input.summaryZh, input.summaryEn),
  }
}

function references(
  locale: CdssLocale,
  recommendation: CdssRecommendation,
): GuidelineReference[] {
  switch (recommendation.id) {
    case 'dyslipidemia-severe-triglycerides':
      return [reference({
        locale,
        id: 'TG',
        recommendationId: 'Top Things to Know 10',
        locatorZh: '持續性高 TG 與胰臟炎風險',
        locatorEn: 'Persistent hypertriglyceridemia and pancreatitis risk',
        summaryZh: '持續高 TG 的 ASCVD 藥物基礎仍是 statin；為預防胰臟炎，尤其 TG ≥1000 mg/dL 時可需要 TG 降低治療。',
        summaryEn: 'Statin therapy remains the pharmacologic foundation for ASCVD risk with persistent triglyceride elevation; triglyceride-lowering therapy may be needed to prevent pancreatitis, especially at ≥1000 mg/dL.',
      })]
    case 'dyslipidemia-severe-ldl':
      return [reference({
        locale,
        id: 'LDL190',
        url: PREVENT_MESSAGES_URL,
        page: 2,
        recommendationId: 'Section 4.2.3.7 / Clinician message 4',
        locatorZh: 'LDL-C ≥190 mg/dL 治療',
        locatorEn: 'Treatment for LDL-C ≥190 mg/dL',
        summaryZh: 'LDL-C ≥190 mg/dL 不需風險估算即建議最大耐受 statin 治療。',
        summaryEn: 'For LDL-C ≥190 mg/dL, maximally tolerated statin therapy is recommended regardless of estimated risk.',
      })]
    case 'dyslipidemia-risk-and-target':
      return [
        reference({
          locale,
          id: 'PREVENT',
          url: PREVENT_MESSAGES_URL,
          page: 4,
          recommendationId: 'Section 4.2.3.2 / PREVENT summary table',
          locatorZh: 'PREVENT 風險分層與 LDL-C／non-HDL-C 目標',
          locatorEn: 'PREVENT risk categories and LDL-C/non-HDL-C goals',
          summaryZh: '初級預防以 PREVENT 分成低、邊緣、中與高風險；邊緣／中風險目標 LDL-C <100、non-HDL-C <130 mg/dL，高風險目標分別 <70 與 <100 mg/dL。',
          summaryEn: 'Primary prevention uses low, borderline, intermediate, and high PREVENT risk; borderline/intermediate goals are LDL-C <100 and non-HDL-C <130 mg/dL, and high-risk goals are <70 and <100 mg/dL.',
        }),
        reference({
          locale,
          id: 'SECONDARY',
          recommendationId: 'Top Things to Know 9',
          locatorZh: 'ASCVD 次級預防目標',
          locatorEn: 'Secondary-prevention goals in ASCVD',
          summaryZh: '極高風險 ASCVD 目標 LDL-C <55、non-HDL-C <85 mg/dL；少數非極高風險 ASCVD 至少以 LDL-C <70 mg/dL 為目標。',
          summaryEn: 'Very-high-risk ASCVD goals are LDL-C <55 and non-HDL-C <85 mg/dL; the smaller non-very-high-risk ASCVD group has at least an LDL-C goal <70 mg/dL.',
        }),
      ]
    case 'dyslipidemia-lipid-lowering-therapy':
      return [
        reference({
          locale,
          id: 'RISK-THERAPY',
          url: PREVENT_MESSAGES_URL,
          page: 2,
          recommendationId: 'Section 4.2.3.7 / Clinician messages 4–5',
          locatorZh: '依 PREVENT 風險選擇強度與未達標加成',
          locatorEn: 'Risk-based intensity and add-on therapy when not at goal',
          summaryZh: '中度或高強度治療依風險分層；最大耐受 statin 未達標時可依風險加入 ezetimibe，適當時再評估 PCSK9 抑制劑或 bempedoic acid。',
          summaryEn: 'Use moderate- or high-intensity therapy according to risk; when maximally tolerated statin does not achieve goals, add ezetimibe and, when appropriate, a PCSK9 inhibitor or bempedoic acid.',
        }),
        reference({
          locale,
          id: 'SPECIAL-POPULATIONS',
          recommendationId: 'Top Things to Know 8',
          locatorZh: '糖尿病、CKD 與 HIV',
          locatorEn: 'Diabetes, CKD, and HIV',
          summaryZh: '40–75 歲糖尿病、CKD 第 3–4 期或 HIV 成人，不論 LDL-C 數值皆建議初級預防 LDL 降低治療。',
          summaryEn: 'For adults aged 40–75 with diabetes, CKD stage 3–4, or HIV, LDL-lowering therapy is recommended for primary prevention regardless of LDL-C level.',
        }),
      ]
    case 'dyslipidemia-monitoring-and-markers':
      return [
        reference({
          locale,
          id: 'LPA-APOB',
          recommendationId: 'Top Things to Know 5–6',
          locatorZh: 'ApoB 與 Lp(a)',
          locatorEn: 'ApoB and Lp(a)',
          summaryZh: '成年後至少量一次 Lp(a)；ApoB 可在 TG >200 mg/dL、糖尿病、ASCVD／高風險或已達很低 LDL-C 時補充殘餘風險判讀。',
          summaryEn: 'Measure Lp(a) at least once in adulthood; ApoB can refine residual risk with triglycerides >200 mg/dL, diabetes, ASCVD/high risk, or low achieved LDL-C.',
        }),
        reference({
          locale,
          id: 'HUB',
          url: GUIDELINE_HUB_URL,
          recommendationId: 'Guideline hub and clinical resources',
          locatorZh: '2026 血脂異常指引官方資源',
          locatorEn: 'Official 2026 dyslipidemia guideline resources',
          summaryZh: '官方指引涵蓋血脂異常的評估、治療與監測；治療開始或調整後 4–12 週應檢查血脂反應與依從性。',
          summaryEn: 'The official guideline covers dyslipidemia evaluation, treatment, and monitoring; assess lipid response and adherence 4–12 weeks after treatment initiation or adjustment.',
        }),
      ]
    default:
      return []
  }
}

export const AHA_ACC_DYSLIPIDEMIA_2026_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'aha-acc-dyslipidemia-2026',
      kind: 'guideline',
      label: localize(locale, '美國 ACC／AHA 血脂異常指引', 'US ACC/AHA dyslipidemia guideline'),
      version: '2026',
      effectiveFrom: '2026-03-13',
    }
  },
  assess({ recommendation, locale }) {
    const metadata = this.metadata(locale)
    return assessment({
      sourceId: metadata.id,
      sourceKind: metadata.kind,
      sourceLabel: metadata.label,
      version: metadata.version,
      effectiveFrom: metadata.effectiveFrom,
      status: recommendation.status === 'needs-data'
        ? 'needs-data'
        : recommendation.status === 'actionable'
          ? 'recommended'
          : 'consider',
      summary: localize(
        locale,
        '以 2026 ACC／AHA 的 PREVENT 風險、絕對 LDL-C／non-HDL-C 目標、Lp(a)／ApoB 與階梯式治療架構評估。',
        'Assess using the 2026 ACC/AHA PREVENT framework, absolute LDL-C/non-HDL-C goals, Lp(a)/ApoB, and stepwise treatment strategy.',
      ),
      missingData: recommendation.status === 'needs-data'
        ? recommendation.missingData
        : undefined,
      references: references(locale, recommendation),
    })
  },
}
