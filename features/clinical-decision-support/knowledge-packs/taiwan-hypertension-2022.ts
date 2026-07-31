import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssRecommendation,
  GuidelineReference,
} from '../types'
import { assessment, localize, pdfPageUrl } from './shared'

const GUIDELINE_URL = '/clinical-guidelines/taiwan-hypertension-2022/2022-tsoc-ths-hypertension-guideline.pdf'

function reference(input: {
  locale: CdssLocale
  id: string
  page: number
  printedPage: string
  recommendationId: string
  evidenceGrade?: string
  locatorZh: string
  locatorEn: string
  summaryZh: string
  summaryEn: string
}): GuidelineReference {
  return {
    id: `TW-HTN-2022-${input.id}`,
    title: localize(
      input.locale,
      '2022 台灣高血壓治療指引',
      '2022 Guidelines of the Taiwan Society of Cardiology and the Taiwan Hypertension Society for the Management of Hypertension',
    ),
    publisher: localize(
      input.locale,
      '台灣心臟學會／台灣高血壓學會',
      'Taiwan Society of Cardiology / Taiwan Hypertension Society',
    ),
    version: '2022',
    url: pdfPageUrl(GUIDELINE_URL, input.page),
    page: input.page,
    printedPage: input.printedPage,
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
        id: 'HMOD',
        page: 22,
        printedPage: '246',
        recommendationId: 'Section 4.4 / Table 10',
        locatorZh: '第 4.4 節 → 高血壓媒介器官損傷',
        locatorEn: 'Section 4.4 → hypertension-mediated organ damage',
        summaryZh: '初診高血壓應做基本器官損傷篩檢；嚴重血壓合併神經、眼底、心臟、腎臟或血管表現時需針對症狀進一步評估。',
        summaryEn: 'Perform basic organ-damage screening at the first hypertension visit and investigate neurologic, retinal, cardiac, kidney, or vascular findings when severe BP is accompanied by compatible features.',
      })]
    case 'hypertension-measurement':
      return [reference({
        locale,
        id: '722',
        page: 12,
        printedPage: '236',
        recommendationId: 'Section 3 recommendations/keypoints',
        evidenceGrade: 'COR I, LOE B',
        locatorZh: '第 3 節 → 居家血壓 722 量測',
        locatorEn: 'Section 3 → 722 home BP monitoring',
        summaryZh: '以經驗證裝置、正確袖帶與標準流程量測；722 為連續 7 天、早晚各一回、每回至少 2 筆且間隔 1 分鐘。',
        summaryEn: 'Use a validated device, appropriate cuff, and standardized technique; the 722 protocol uses 7 consecutive days, morning and evening sessions, and at least 2 readings 1 minute apart.',
      })]
    case 'hypertension-control-target':
      return [reference({
        locale,
        id: 'TARGET',
        page: 30,
        printedPage: '254',
        recommendationId: 'Section 6 recommendations/keypoints',
        evidenceGrade: 'COR I, LOE A',
        locatorZh: '第 6 節 → 治療閾值與目標',
        locatorEn: 'Section 6 → treatment threshold and target',
        summaryZh: '依 722 居家血壓，所有高血壓病人的通用目標為 <130/80 mmHg；若不能耐受需個別化。',
        summaryEn: 'Using 722 home BP, the universal target is <130/80 mm Hg for people with hypertension, individualized when not tolerated.',
      })]
    case 'hypertension-treatment-strategy':
      return [
        reference({
          locale,
          id: 'FIRST-LINE',
          page: 39,
          printedPage: '263',
          recommendationId: 'Section 8 recommendations/keypoints',
          evidenceGrade: 'COR I, LOE B',
          locatorZh: '第 8 節 → 第一線降壓藥',
          locatorEn: 'Section 8 → first-line antihypertensive drugs',
          summaryZh: '台灣指引將 ACEI、ARB、β 阻斷劑、CCB 與 thiazide 類利尿劑列為五大第一線藥物；仍需依共病與禁忌選擇。',
          summaryEn: 'The Taiwan guideline lists ACE inhibitors, ARBs, beta-blockers, CCBs, and thiazide diuretics as the 5 major first-line options, selected according to comorbidity and contraindications.',
        }),
        reference({
          locale,
          id: 'COMBINATION',
          page: 44,
          printedPage: '268',
          recommendationId: 'Section 8.3',
          evidenceGrade: 'COR I, LOE B',
          locatorZh: '第 8.3 節 → 合併治療',
          locatorEn: 'Section 8.3 → combination therapy',
          summaryZh: '血壓高於目標 ≥20/10 mmHg 時建議起始合併治療，優先考慮單錠複方；ACEI、ARB 與直接 renin inhibitor 不可彼此合併。',
          summaryEn: 'When BP is ≥20/10 mm Hg above target, initial combination therapy, preferably a single-pill combination, is recommended; ACE inhibitors, ARBs, and direct renin inhibitors must not be combined with one another.',
        }),
      ]
    case 'hypertension-baseline-evaluation':
      return [reference({
        locale,
        id: 'BASELINE',
        page: 21,
        printedPage: '245',
        recommendationId: 'Section 4.3 / Table 9',
        locatorZh: '第 4.3 節 → 高血壓基礎檢驗',
        locatorEn: 'Section 4.3 → baseline laboratory evaluation',
        summaryZh: '初診應評估血球、腎功能、電解質、血糖／HbA1c、血脂、尿液與 ECG；台灣特別強調尿白蛋白或 UACR。',
        summaryEn: 'At the first visit, evaluate blood count, kidney function, electrolytes, glucose/HbA1c, lipids, urine, and ECG; the Taiwan guideline particularly emphasizes urine albumin or UACR.',
      })]
    default:
      return []
  }
}

export const TAIWAN_HYPERTENSION_2022_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'taiwan-hypertension-2022',
      kind: 'guideline',
      label: localize(locale, '台灣高血壓指引', 'Taiwan hypertension guideline'),
      version: '2022',
      effectiveFrom: '2022-05-31',
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
        '以台灣 722 居家血壓、<130/80 mmHg 目標及本土第一線藥物架構評估。',
        'Assess using Taiwan 722 home BP monitoring, the <130/80 mm Hg target, and the local first-line medication framework.',
      ),
      missingData: recommendation.status === 'needs-data'
        ? recommendation.missingData
        : undefined,
      references: references(locale, recommendation),
    })
  },
}
