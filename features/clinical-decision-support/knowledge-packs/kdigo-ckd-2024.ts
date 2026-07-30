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
    case 'ckd-blood-pressure-volume':
      return [reference({
        locale,
        id: '3.4.1',
        page: 43,
        recommendationId: 'Recommendation 3.4.1; Practice Point 3.4.1',
        evidenceGrade: '2B',
        locatorZh: '第 3 章 → CKD 血壓控制',
        locatorEn: 'Chapter 3 → blood pressure control in CKD',
        summaryZh: '高血壓 CKD 成人在標準化診間量測且可耐受時，可將 SBP <120 mmHg 作為目標；衰弱、跌倒風險、有限預期壽命或症狀性姿勢性低血壓應較寬鬆。',
        summaryEn: 'For adults with high blood pressure and CKD, target SBP below 120 mm Hg when tolerated using standardized office measurement; use a less intensive approach with frailty, fall risk, limited life expectancy, or symptomatic orthostasis.',
      })]
    case 'ckd-rasi-strategy':
      return [reference({
        locale,
        id: '3.6',
        page: 44,
        recommendationId: 'Recommendations 3.6.1-3.6.4; Practice Points 3.6.1-3.6.7',
        evidenceGrade: '1B / 2C',
        locatorZh: '第 3 章 → RAS 抑制劑',
        locatorEn: 'Chapter 3 → renin-angiotensin system inhibitors',
        summaryZh: '依糖尿病與 A2/A3 白蛋白尿評估 ACEI 或 ARB；開始或增量後 2–4 週監測，4 週內 creatinine 上升 >30% 才觸發原因評估，eGFR <30 本身不是停藥理由。',
        summaryEn: 'Assess an ACE inhibitor or ARB according to diabetes and A2/A3 albuminuria; monitor 2–4 weeks after initiation or titration, evaluate a creatinine rise over 30% within 4 weeks, and do not stop solely because eGFR falls below 30.',
      })]
    case 'ckd-sglt2-strategy':
      return [reference({
        locale,
        id: '3.7',
        page: 44,
        recommendationId: 'Recommendations 3.7.1-3.7.3',
        evidenceGrade: '1A / 2B',
        locatorZh: '第 3 章 → SGLT2 抑制劑',
        locatorEn: 'Chapter 3 → SGLT2 inhibitors',
        summaryZh: '成人 CKD 在 eGFR ≥20 且 ACR ≥200 mg/g 或合併心衰竭時建議 SGLT2 抑制劑；eGFR 20–45 且 ACR <200 mg/g 時亦可評估。',
        summaryEn: 'Recommend an SGLT2 inhibitor for adults with CKD and eGFR at least 20 with ACR at least 200 mg/g, or with heart failure; also consider it at eGFR 20–45 with ACR below 200 mg/g.',
      })]
    case 'ckd-finerenone-strategy':
      return [reference({
        locale,
        id: '3.8',
        page: 44,
        recommendationId: 'Recommendation 3.8.1; Practice Points 3.8.1-3.8.4',
        evidenceGrade: '2A',
        locatorZh: '第 3 章 → 非類固醇 MRA',
        locatorEn: 'Chapter 3 → nonsteroidal mineralocorticoid receptor antagonists',
        summaryZh: 'T2D 合併 CKD 只有在 eGFR >25、正常血鉀、持續 UACR >30 mg/g 且已使用最大耐受 RASi 後，才進一步評估具心腎效益的非類固醇 MRA。',
        summaryEn: 'In T2D with CKD, assess a nonsteroidal MRA with proven cardiorenal benefit only after confirming eGFR above 25, normal potassium, persistent UACR above 30 mg/g, and maximally tolerated RASi.',
      })]
    case 'ckd-cardiovascular-risk':
      return [reference({
        locale,
        id: '3.15.1',
        page: 46,
        recommendationId: 'Recommendations 3.15.1.1-3.15.1.3',
        evidenceGrade: '1A / 1B / 2A',
        locatorZh: '第 3 章 → CKD 血脂管理',
        locatorEn: 'Chapter 3 → lipid management in CKD',
        summaryZh: '成人 CKD 的 statin 建議依年齡、eGFR 與 ASCVD／糖尿病風險分層；仍需核對透析／移植狀態、耐受性與病人目標。',
        summaryEn: 'Statin guidance in adult CKD is stratified by age, eGFR, and ASCVD/diabetes risk; dialysis/transplant status, tolerance, and patient goals still require review.',
      })]
    case 'ckd-medication-safety':
      return [reference({
        locale,
        id: '4.1-4.2',
        page: 50,
        recommendationId: 'Practice Points 4.1.1-4.1.3; 4.2.1-4.2.3',
        locatorZh: '第 4 章 → 藥物安全與依 GFR 調整劑量',
        locatorEn: 'Chapter 4 → medication safety and GFR-based dosing',
        summaryZh: 'CKD 應權衡潛在腎毒性、監測 eGFR／電解質／必要藥物濃度、核對成藥與草藥，並依 GFR 評估腎排除藥物劑量。',
        summaryEn: 'In CKD, balance nephrotoxicity, monitor eGFR/electrolytes/drug levels when indicated, review OTC and herbal products, and consider GFR for kidney-cleared dosing.',
      })]
    case 'ckd-nutrition':
      return [reference({
        locale,
        id: '3.3',
        page: 42,
        recommendationId: 'Recommendation 3.3.1.1; Practice Points 3.3.1.1-3.3.1.5; Recommendation 3.3.2.1',
        evidenceGrade: '2C',
        locatorZh: '第 3 章 → 蛋白質與鈉攝取',
        locatorEn: 'Chapter 3 → protein and sodium intake',
        summaryZh: '一般成人 G3–G5 建議蛋白質約 0.8 g/kg/day、避免 >1.3 g/kg/day，鈉 <2 g/day；高齡合併衰弱或肌少症應考慮較高蛋白與熱量。',
        summaryEn: 'For most adults with G3–G5, maintain protein around 0.8 g/kg/day, avoid above 1.3 g/kg/day, and keep sodium below 2 g/day; older adults with frailty or sarcopenia may need higher protein and calories.',
      })]
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
    case 'ckd-potassium-acidosis':
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
