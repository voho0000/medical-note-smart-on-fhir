import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssRecommendation,
  GuidelineReference,
} from '../types'
import { assessment, localize } from './shared'
import evidenceIndex from './evidence-indexes/taiwan-t2dm-2022.json'

const GUIDELINE_URL = 'https://www.endo-dm.org.tw/dia/journal/bookdia.asp?id=88'
const UPDATE_URL = 'https://www.endo-dm.org.tw/dia/direct/content.asp?BK_KIND=64'

function required<T>(value: T | undefined): T {
  if (!value) {
    throw new Error('Taiwan T2DM 2022 evidence index is incomplete')
  }
  return value
}

const guidelineDocument = required(evidenceIndex.documents.find(
  (document) => document.id === 'taiwan-t2dm-clinical-care-guideline-2022',
))

function pdfPageUrl(url: string, page: number): string {
  return `${url}#page=${page}`
}

function indexedReference(input: {
  locale: CdssLocale
  entryId: string
  locatorZh: string
  locatorEn: string
  summaryEn: string
}): GuidelineReference {
  const entry = required(evidenceIndex.entries.find(
    (candidate) => candidate.id === input.entryId,
  ))

  return {
    id: `TW-T2DM-2022-${entry.id}`,
    title: localize(input.locale, entry.title, '2022 Taiwan Type 2 Diabetes Clinical Care Guideline'),
    publisher: localize(input.locale, '中華民國糖尿病學會', 'Diabetes Association of the Republic of China (Taiwan)'),
    version: guidelineDocument.version,
    url: pdfPageUrl(guidelineDocument.localUrl, entry.pdfPage),
    recommendationId: entry.ruleId,
    page: entry.pdfPage,
    printedPage: entry.printedPage,
    locator: localize(input.locale, input.locatorZh, input.locatorEn),
    summary: localize(input.locale, entry.summary, input.summaryEn),
  }
}

function references(locale: CdssLocale, recommendation: CdssRecommendation): GuidelineReference[] {
  switch (recommendation.id) {
    case 'complete-kidney-risk':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-dkd-screening',
        locatorZh: '第 15 章 → 2、糖尿病腎臟疾病 → DKD 篩檢（書面頁 189）',
        locatorEn: 'Chapter 15 → 2. Diabetic kidney disease → DKD screening (printed page 189)',
        summaryEn: 'Screen every newly diagnosed person with type 2 diabetes using UACR, serum creatinine, and calculated eGFR.',
      })]
    case 'review-egfr-trajectory':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-dkd-monitoring',
        locatorZh: '第 23 章 → 1、臨床監測建議 → 腎臟與註 3（書面頁 311）',
        locatorEn: 'Chapter 23 → 1. Clinical monitoring → kidney row and note 3 (printed page 311)',
        summaryEn: 'Check kidney measures annually, every three to six months when abnormal, and at least every six months when UACR is above 300 mg/g and/or eGFR is 30–60.',
      })]
    case 'sglt2-concordance':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-dkd-sglt2',
        locatorZh: '第 15 章 → 2、糖尿病腎臟疾病 → 臨床建議表（書面頁 189）',
        locatorEn: 'Chapter 15 → 2. Diabetic kidney disease → clinical recommendations (printed page 189)',
        summaryEn: 'When UACR is at least 30 mg/g or eGFR is below 60 mL/min/1.73m², the guideline strongly recommends prioritizing an SGLT2 inhibitor.',
      })]
    case 'glycemic-safety-older-adult':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-older-adult-targets',
        locatorZh: '第 20 章 → 老年人的糖尿病照護 → 臨床建議表（書面頁 251）',
        locatorEn: 'Chapter 20 → Diabetes care for older adults → clinical recommendations (printed page 251)',
        summaryEn: 'Set individualized glycemic goals for older adults using comorbidities, cognitive function, and physical function.',
      })]
    case 'blood-pressure-review':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-blood-pressure',
        locatorZh: '第 14 章 → 1、高血壓 → 臨床建議表（書面頁 137）',
        locatorEn: 'Chapter 14 → 1. Hypertension → clinical recommendations (printed page 137)',
        summaryEn: 'Use home monitoring and individualized blood pressure goals; the general target is below 140/90 mmHg, with below 130/80 mmHg considered for higher cardiovascular risk.',
      })]
    case 'kidney-medication-strategy':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-raas-blocker',
        locatorZh: '第 14 章 → 1、高血壓 → 降壓藥物選擇（書面頁 138）',
        locatorEn: 'Chapter 14 → 1. Hypertension → antihypertensive selection (printed page 138)',
        summaryEn: 'For diabetes with albuminuria or coronary artery disease, use an ACE inhibitor or ARB as the preferred antihypertensive; do not combine both classes.',
      })]
    case 'ascvd-lipid-strategy':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-statin-secondary-prevention',
        locatorZh: '第 14 章 → 2、血脂異常 → 臨床建議表（書面頁 147）',
        locatorEn: 'Chapter 14 → 2. Dyslipidemia → clinical recommendations (printed page 147)',
        summaryEn: 'For diabetes with cardiovascular disease, target LDL-C below 70 mg/dL or a 50% reduction and use a statin when not contraindicated.',
      })]
    case 'complication-screening':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-complication-monitoring',
        locatorZh: '第 23 章 → 1、臨床監測建議 → 眼睛、足部與神經病變（書面頁 311）',
        locatorEn: 'Chapter 23 → 1. Clinical monitoring → eye, foot, and neuropathy rows (printed page 311)',
        summaryEn: 'Assess vision and retina, foot pulses and ankle-brachial index, monofilament pressure, and 128-Hz tuning-fork vibration generally once per year.',
      })]
    case 'older-adult-safety':
      return [
        indexedReference({
          locale,
          entryId: 'tw-t2dm-2022-older-adult-cga',
          locatorZh: '第 20 章 → 糖尿病與多重共病及老年症候群 → CGA（書面頁 253）',
          locatorEn: 'Chapter 20 → Multimorbidity and geriatric syndromes → CGA (printed page 253)',
          summaryEn: 'Base care for older adults on comprehensive geriatric assessment covering daily function, cognition, family care, social support, and quality of life.',
        }),
        indexedReference({
          locale,
          entryId: 'tw-t2dm-2022-cognitive-mental-monitoring',
          locatorZh: '第 23 章 → 1、臨床監測建議 → 精神狀態、失智風險與 AD8（書面頁 311）',
          locatorEn: 'Chapter 23 → 1. Clinical monitoring → mental status, dementia risk, and AD8 (printed page 311)',
          summaryEn: 'Assess depression, anxiety, and distress in high-risk people and evaluate dementia risk in older or high-risk adults, with AD8 as an initial screen.',
        }),
      ]
    case 'care-gap-inventory':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-clinical-monitoring-inventory',
        locatorZh: '第 23 章 → 1、糖尿病人的臨床監測建議表（書面頁 311）',
        locatorEn: 'Chapter 23 → 1. Diabetes clinical monitoring table (printed page 311)',
        summaryEn: 'Lists recommended intervals for A1C, education, lipids, kidney, eye, foot, neuropathy, oral, and cancer screening.',
      })]
    case 'immunization-review':
      return [indexedReference({
        locale,
        entryId: 'tw-t2dm-2022-immunization',
        locatorZh: '第 22 章 → 5、感染與疫苗注射 → 臨床建議（書面頁 305）',
        locatorEn: 'Chapter 22 → 5. Infection and immunization → clinical recommendations (printed page 305)',
        summaryEn: 'People with diabetes should receive annual influenza vaccination and age- and history-appropriate pneumococcal vaccination; review COVID-19 vaccination under current policy.',
      })]
    default:
      return [{
        id: `TW-T2DM-2022-${recommendation.id}`,
        title: localize(locale, '2022 第 2 型糖尿病臨床照護指引', '2022 Taiwan Type 2 Diabetes Clinical Care Guideline'),
        publisher: localize(locale, '中華民國糖尿病學會', 'Diabetes Association of the Republic of China (Taiwan)'),
        version: '2022',
        url: recommendation.domain === 'complication' ? UPDATE_URL : GUIDELINE_URL,
        locator: localize(locale, '依臨床領域對應章節', 'Corresponding clinical domain chapter'),
        summary: localize(
          locale,
          '目前尚未建立此決策的精準頁碼索引。',
          'An exact page index has not yet been established for this decision.',
        ),
      }]
  }
}

function summaryFor(
  recommendation: CdssRecommendation,
  locale: CdssLocale,
): { status: 'recommended' | 'consider' | 'needs-data'; summary: string } {
  switch (recommendation.id) {
    case 'complete-kidney-risk':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '每年至少一次 eGFR＋UACR；異常者 3–6 個月複查。', 'Check eGFR and UACR at least annually; repeat in three to six months when abnormal.'),
      }
    case 'review-egfr-trajectory':
      return {
        status: 'recommended',
        summary: localize(locale, 'eGFR 30–60 或 UACR >300：至少每半年追蹤。', 'For eGFR 30–60 or UACR above 300, monitor at least every six months.'),
      }
    case 'sglt2-concordance':
      return {
        status: 'consider',
        summary: localize(locale, 'UACR ≥30 或 eGFR <60：優先評估 SGLT2 inhibitor；先核對用藥與安全條件。', 'For UACR at least 30 or eGFR below 60, prioritize an SGLT2 inhibitor after medication and safety review.'),
      }
    case 'glycemic-safety-older-adult':
      return {
        status: 'recommended',
        summary: localize(locale, '依共病、認知、功能與低血糖風險設定高齡個人化目標。', 'Set individualized goals for older adults using comorbidity, cognition, function, and hypoglycemia risk.'),
      }
    case 'blood-pressure-review':
      return {
        status: 'needs-data',
        summary: localize(locale, '取得近期血壓；依風險設定目標並注意姿勢性低血壓。', 'Obtain current blood pressure; set the goal by risk and assess orthostatic hypotension.'),
      }
    case 'kidney-medication-strategy':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'consider',
        summary: localize(locale, '蛋白尿或冠狀動脈疾病：優先評估 ACEI／ARB；避免兩類併用。', 'For albuminuria or coronary disease, prioritize an ACE inhibitor or ARB and avoid combining both classes.'),
      }
    case 'ascvd-lipid-strategy':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '心血管疾病：使用 statin，並以 LDL-C 判斷是否達標。', 'For cardiovascular disease, use a statin and judge goal attainment using LDL-C.'),
      }
    case 'complication-screening':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '眼底、足部血管、單股纖維與 128 Hz 音叉：原則每年一次。', 'Eyes, foot vasculature, monofilament, and 128-Hz tuning fork: generally annually.'),
      }
    case 'older-adult-safety':
      return {
        status: 'needs-data',
        summary: localize(locale, '評估認知、功能、衰弱、低血糖與照護支持。', 'Assess cognition, function, frailty, hypoglycemia, and care support.'),
      }
    case 'care-gap-inventory':
      return {
        status: 'needs-data',
        summary: localize(locale, '依第 23 章核對 HbA1c、血脂、腎臟、眼底、足部與神經檢查。', 'Use Chapter 23 to reconcile A1C, lipids, kidney, eye, foot, and neuropathy checks.'),
      }
    case 'immunization-review':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '每年流感疫苗；肺炎鏈球菌與 COVID-19 依年齡、接種史及當期政策核對。', 'Give influenza vaccine annually and reconcile pneumococcal and COVID-19 vaccination by age, history, and current policy.'),
      }
    default:
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '依台灣照護流程完成本土化評估，未帶入的資料不視為未完成。', 'Apply the Taiwan care pathway and do not treat data absent from this projection as care not performed.'),
      }
  }
}

export const TAIWAN_T2DM_2022_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'taiwan-t2dm-2022',
      kind: 'guideline',
      label: localize(locale, '台灣 T2DM 指引', 'Taiwan T2DM guideline'),
      version: '2022 + amendments',
      effectiveFrom: '2022-01-01',
    }
  },
  assess({ recommendation, locale }) {
    const metadata = this.metadata(locale)
    const result = summaryFor(recommendation, locale)
    return assessment({
      sourceId: metadata.id,
      sourceKind: metadata.kind,
      sourceLabel: metadata.label,
      version: metadata.version,
      effectiveFrom: metadata.effectiveFrom,
      status: result.status,
      summary: result.summary,
      missingData: result.status === 'needs-data' ? recommendation.missingData : undefined,
      references: references(locale, recommendation),
    })
  },
}
