import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssRecommendation,
  GuidelineReference,
} from '../types'
import { assessment, localize, pdfPageUrl } from './shared'

const GUIDELINE_URL = 'https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf'

function reference(input: {
  locale: CdssLocale
  id: string
  page: number
  recommendationId: string
  locatorZh: string
  locatorEn: string
  summaryZh: string
  summaryEn: string
  evidenceGrade?: string
}): GuidelineReference {
  return {
    id: `KDIGO-CKD-2024-${input.id}`,
    title: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease',
    publisher: 'Kidney Disease: Improving Global Outcomes',
    version: '2024',
    url: pdfPageUrl(GUIDELINE_URL, input.page),
    page: input.page,
    recommendationId: input.recommendationId,
    evidenceGrade: input.evidenceGrade,
    locator: localize(input.locale, input.locatorZh, input.locatorEn),
    summary: localize(
      input.locale,
      input.summaryZh,
      input.summaryEn,
    ),
  }
}

function references(
  locale: CdssLocale,
  recommendation: CdssRecommendation,
): GuidelineReference[] {
  switch (recommendation.id) {
    case 'ckd-classification':
      return [reference({
        locale,
        id: '1.1.3.1',
        page: 34,
        recommendationId: 'Practice Point 1.1.3.1',
        locatorZh: '第 1 章 → CKD 慢性化證據',
        locatorEn: 'Chapter 1 → proof of CKD chronicity',
        summaryZh: 'CKD 慢性化至少需 3 個月，可由既往檢驗、診斷、影像或重複量測建立；不可由單次異常推定。',
        summaryEn: 'Establish chronicity over at least 3 months using prior measurements, diagnoses, imaging, or repeat testing; do not infer CKD from a single abnormal result.',
      })]
    case 'ckd-monitoring':
      return [reference({
        locale,
        id: '2.1.1-2.1.5',
        page: 40,
        recommendationId: 'Practice Points 2.1.1-2.1.5',
        locatorZh: '第 2 章 → GFR 與 ACR 追蹤',
        locatorEn: 'Chapter 2 → GFR and ACR monitoring',
        summaryZh: 'CKD 至少每年評估 eGFR 與白蛋白尿；高風險者增加頻率。後續 eGFR 變化超過 20% 或 ACR 倍增需評估。',
        summaryEn: 'Assess eGFR and albuminuria at least annually and more often at higher risk. Evaluate a subsequent eGFR change over 20% or a doubling of ACR.',
      })]
    case 'ckd-kidney-failure-risk':
      return [reference({
        locale,
        id: '2.2.1',
        page: 41,
        recommendationId: 'Recommendation 2.2.1; Practice Points 2.2.1-2.2.4',
        evidenceGrade: '1A',
        locatorZh: '第 2 章 → 腎衰竭風險預測',
        locatorEn: 'Chapter 2 → kidney failure risk prediction',
        summaryZh: 'CKD G3-G5 應使用外部驗證的風險方程式；5 年風險 3%-5% 可輔助轉介，2 年風險 >10% 與 >40% 可輔助多專業照護及腎臟替代治療準備時機。',
        summaryEn: 'Use an externally validated equation in CKD G3-G5. Five-year risk of 3%-5% can inform referral, while 2-year risk above 10% and 40% can inform multidisciplinary care and KRT preparation.',
      })]
    case 'ckd-kidney-protection':
      return [
        reference({
          locale,
          id: '3.6',
          page: 43,
          recommendationId: 'Recommendations 3.6.1-3.6.4',
          evidenceGrade: '1B / 2C',
          locatorZh: '第 3 章 → RAS 抑制劑',
          locatorEn: 'Chapter 3 → renin-angiotensin system inhibitors',
          summaryZh: '依糖尿病與 A2/A3 白蛋白尿條件評估 ACEI 或 ARB，避免 ACEI、ARB 與直接腎素抑制劑合併。',
          summaryEn: 'Evaluate an ACE inhibitor or ARB according to diabetes and A2/A3 albuminuria, and avoid combining ACE inhibitors, ARBs, and direct renin inhibitors.',
        }),
        reference({
          locale,
          id: '3.7',
          page: 44,
          recommendationId: 'Recommendations 3.7.1-3.7.3',
          evidenceGrade: '1A / 2B',
          locatorZh: '第 3 章 → SGLT2 抑制劑',
          locatorEn: 'Chapter 3 → SGLT2 inhibitors',
          summaryZh: '成人 CKD 在 eGFR ≥20 且 ACR ≥200 mg/g 或合併心衰竭時建議 SGLT2 抑制劑；eGFR 20-45 且 ACR <200 mg/g 時亦可評估。',
          summaryEn: 'Recommend an SGLT2 inhibitor for adults with CKD and eGFR at least 20 with ACR at least 200 mg/g, or with heart failure; also consider it at eGFR 20-45 with ACR below 200 mg/g.',
        }),
      ]
    case 'ckd-referral-care':
      return [reference({
        locale,
        id: '5.1.1',
        page: 49,
        recommendationId: 'Practice Point 5.1.1',
        locatorZh: '第 5 章 → 腎臟專科轉介條件',
        locatorEn: 'Chapter 5 → nephrology referral circumstances',
        summaryZh: '轉介條件包含 eGFR <30、顯著白蛋白尿、持續血尿、難治型高血壓、持續鉀異常、酸中毒、貧血及其他 CKD 併發症。',
        summaryEn: 'Referral circumstances include eGFR below 30, significant albuminuria, persistent hematuria, refractory hypertension, persistent potassium abnormalities, acidosis, anemia, and other CKD complications.',
      })]
    case 'ckd-complication-monitoring':
      return [reference({
        locale,
        id: '3.10.1',
        page: 45,
        recommendationId: 'Practice Point 3.10.1',
        locatorZh: '第 3 章 → CKD 代謝性酸中毒',
        locatorEn: 'Chapter 3 → metabolic acidosis in CKD',
        summaryZh: '可考慮介入以避免具臨床影響的酸中毒；成人 bicarbonate <18 mmol/L 是指引舉例門檻，不代表 ≥18 應自動治療。',
        summaryEn: 'Consider intervention to prevent acidosis with clinical implications; bicarbonate below 18 mmol/L is the adult example threshold and does not imply automatic treatment at or above 18.',
      })]
    default:
      return []
  }
}

export const KDIGO_CKD_2024_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'kdigo-ckd-2024',
      kind: 'guideline',
      label: localize(locale, 'KDIGO CKD 指引', 'KDIGO CKD guideline'),
      version: '2024',
      effectiveFrom: '2024-03-13',
    }
  },
  assess({ recommendation, locale }) {
    const metadata = this.metadata(locale)
    const status = recommendation.status === 'needs-data'
      ? 'needs-data'
      : recommendation.status === 'actionable'
        ? 'recommended'
        : 'consider'
    return assessment({
      sourceId: metadata.id,
      sourceKind: metadata.kind,
      sourceLabel: metadata.label,
      version: metadata.version,
      effectiveFrom: metadata.effectiveFrom,
      status,
      summary: localize(
        locale,
        '依 KDIGO 2024 的 CKD 分期、風險、追蹤與治療條件，結合完整病歷進行評估。',
        'Apply KDIGO 2024 CKD staging, risk, monitoring, and treatment criteria using the complete chart.',
      ),
      missingData: recommendation.status === 'needs-data'
        ? recommendation.missingData
        : undefined,
      references: references(locale, recommendation),
    })
  },
}
