import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssRecommendation,
  GuidelineReference,
} from '../types'
import { assessment, localize } from './shared'

const GUIDELINE_URL = 'https://www.jacc.org/doi/10.1016/j.jacc.2025.05.007'

function exactUrl(text: string): string {
  return `${GUIDELINE_URL}#:~:text=${encodeURIComponent(text)}`
}

function reference(input: {
  locale: CdssLocale
  id: string
  targetText: string
  recommendationId: string
  evidenceGrade?: string
  locatorZh: string
  locatorEn: string
  summaryZh: string
  summaryEn: string
}): GuidelineReference {
  return {
    id: `AHA-ACC-HTN-2025-${input.id}`,
    title: '2025 AHA/ACC Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults',
    publisher: 'American Heart Association / American College of Cardiology',
    version: '2025',
    url: exactUrl(input.targetText),
    directLink: true,
    recommendationId: input.recommendationId,
    evidenceGrade: input.evidenceGrade,
    locator: localize(input.locale, input.locatorZh, input.locatorEn),
    summary: localize(input.locale, input.summaryZh, input.summaryEn),
  }
}

function references(
  locale: CdssLocale,
  recommendation: CdssRecommendation,
): GuidelineReference[] {
  switch (recommendation.id) {
    case 'hypertension-severe-safety':
      return [reference({
        locale,
        id: '6.2',
        targetText: 'In adults with a hypertensive emergency',
        recommendationId: 'Section 6.2, Recommendations 1 and 4',
        evidenceGrade: 'COR 1 B-NR / COR 3 Harm B-NR',
        locatorZh: '第 6.2 節 → 高血壓急症與嚴重高血壓',
        locatorEn: 'Section 6.2 → hypertensive emergencies and severe hypertension',
        summaryZh: '血壓 >180/120 且有急性標的器官損傷才是高血壓急症並需 ICU；沒有急性器官損傷時不應短時間積極或靜脈降壓，而應及時恢復或加強口服治療。',
        summaryEn: 'BP >180/120 with acute target-organ damage is a hypertensive emergency requiring ICU care. Without acute organ damage, avoid aggressive short-term or IV lowering and promptly reinstitute or intensify oral treatment.',
      })]
    case 'hypertension-measurement':
      return [
        reference({
          locale,
          id: '3.1.1',
          targetText: 'When diagnosing and managing high BP in adults',
          recommendationId: 'Section 3.1.1, Recommendation 1',
          evidenceGrade: 'COR 1, LOE C-LD',
          locatorZh: '第 3.1.1 節 → 正確門診血壓量測',
          locatorEn: 'Section 3.1.1 → accurate in-office BP measurement',
          summaryZh: '診斷與管理高血壓需採標準化量測；單筆數值不足，門診血壓應以至少兩次、至少兩個不同時點的平均減少誤差。',
          summaryEn: 'Use standardized measurement for diagnosis and management; one reading is inadequate, and averaging ≥2 measurements on ≥2 occasions reduces error.',
        }),
        reference({
          locale,
          id: '3.1.4',
          targetText: 'In adults with suspected hypertension, out-of-office BP measurements',
          recommendationId: 'Section 3.1.4, Recommendations 1–2',
          evidenceGrade: 'COR 1, LOE A',
          locatorZh: '第 3.1.4 節 → ABPM 與 HBPM',
          locatorEn: 'Section 3.1.4 → ABPM and HBPM',
          summaryZh: '疑似高血壓應以 ABPM 或 HBPM 確認；使用降壓藥者建議用 HBPM 搭配教育與臨床介入監測調藥。',
          summaryEn: 'Confirm suspected hypertension with ABPM or HBPM and use HBPM with education and clinical cointerventions to monitor medication titration.',
        }),
      ]
    case 'hypertension-control-target':
      return [reference({
        locale,
        id: '5.2.7',
        targetText: 'In adults with confirmed hypertension who are at increased risk',
        recommendationId: 'Section 5.2.7, Recommendations 1–4',
        evidenceGrade: 'COR 1 A / COR 1 B-R / COR 2b B-NR',
        locatorZh: '第 5.2.7 節 → 高血壓治療目標',
        locatorEn: 'Section 5.2.7 → BP goal for patients with hypertension',
        summaryZh: '高心血管風險成人建議 SBP <130 且 DBP <80；非高風險成人 <130/80 亦屬合理，有限壽命或機構住民需共同決策個別化。',
        summaryEn: 'For adults at increased CVD risk, target SBP <130 and DBP <80; <130/80 is also reasonable at lower risk, with individualized shared decisions for limited life expectancy or institutional care.',
      })]
    case 'hypertension-treatment-strategy':
      return [
        reference({
          locale,
          id: '5.2.1',
          targetText: 'Initiation of medication therapy to lower blood pressure',
          recommendationId: 'Section 5.2.1',
          locatorZh: '第 5.2.1 節 → 依心血管風險開始藥物',
          locatorEn: 'Section 5.2.1 → initiation using overall CVD risk',
          summaryZh: '平均血壓 ≥140/90 應在生活型態外開始藥物；平均 ≥130/80 且有 CVD、腦中風、糖尿病、CKD 或 PREVENT 10 年風險 ≥7.5% 亦建議藥物治療。',
          summaryEn: 'Add medication for average BP ≥140/90, and for average BP ≥130/80 with CVD, prior stroke, diabetes, CKD, or PREVENT 10-year risk ≥7.5%.',
        }),
        reference({
          locale,
          id: '5.2.4',
          targetText: 'In adults with stage 2 hypertension',
          recommendationId: 'Section 5.2.4, Recommendations 1 and 3',
          evidenceGrade: 'COR 1 B-R / COR 3 Harm A',
          locatorZh: '第 5.2.4 節 → 單藥與起始合併治療',
          locatorEn: 'Section 5.2.4 → initial monotherapy versus combination therapy',
          summaryZh: '第二級高血壓建議兩種不同第一線藥物，理想為單錠複方；ACEI、ARB 與 renin inhibitor 不應彼此合併。',
          summaryEn: 'For stage 2 hypertension, use 2 different first-line agents, ideally as a single-pill combination; do not combine an ACE inhibitor, ARB, or renin inhibitor with one another.',
        }),
      ]
    case 'hypertension-baseline-evaluation':
      return [reference({
        locale,
        id: '3.1.2',
        targetText: 'For adults who are diagnosed with hypertension, laboratory tests',
        recommendationId: 'Section 3.1.2, Recommendation 1 / Table 6',
        evidenceGrade: 'COR 1, LOE C-EO',
        locatorZh: '第 3.1.2 節 → 基礎檢驗與診斷程序',
        locatorEn: 'Section 3.1.2 → laboratory tests and diagnostic procedures',
        summaryZh: '高血壓基礎評估包含 CBC、電解質、creatinine／eGFR、血脂、血糖／HbA1c、TSH、尿液分析、UACR 與 12 導程 ECG。',
        summaryEn: 'Baseline hypertension evaluation includes CBC, electrolytes, creatinine/eGFR, lipids, glucose/HbA1c, TSH, urinalysis, UACR, and a 12-lead ECG.',
      })]
    default:
      return []
  }
}

export const AHA_ACC_HYPERTENSION_2025_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'aha-acc-hypertension-2025',
      kind: 'guideline',
      label: localize(locale, '美國 AHA／ACC 高血壓指引', 'US AHA/ACC hypertension guideline'),
      version: '2025',
      effectiveFrom: '2025-08-14',
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
        '以 2025 AHA／ACC 的標準化量測、PREVENT 風險門檻、<130/80 mmHg 目標與分期治療架構評估。',
        'Assess using the 2025 AHA/ACC standardized measurement, PREVENT risk threshold, <130/80 mm Hg goal, and stage-based treatment framework.',
      ),
      missingData: recommendation.status === 'needs-data'
        ? recommendation.missingData
        : undefined,
      references: references(locale, recommendation),
    })
  },
}
