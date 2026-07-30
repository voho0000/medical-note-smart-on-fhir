import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssRecommendation,
  GuidelineReference,
} from '../types'
import { assessment, localize } from './shared'

const ISSUE_URL = 'https://diabetesjournals.org/care/issue/49/Supplement_1'
const COMPREHENSIVE_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S61/163931/4-Comprehensive-Medical-Evaluation-and-Assessment'
const PHARMACOLOGY_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment'
const CARDIOVASCULAR_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S216/163933/10-Cardiovascular-Disease-and-Risk-Management'
const KIDNEY_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S246/163914/11-Chronic-Kidney-Disease-and-Risk-Management'
const COMPLICATIONS_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S261/163919/12-Retinopathy-Neuropathy-and-Foot-Care-Standards'
const OLDER_ADULTS_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S277/163921/13-Older-Adults-Standards-of-Care-in-Diabetes-2026'

function exactUrl(sourceUrl: string, text: string): string {
  return `${sourceUrl}#:~:text=${encodeURIComponent(text)}`
}

function exactReference(input: {
  locale: CdssLocale
  id: string
  sourceUrl: string
  targetText: string
  recommendationId: string
  evidenceGrade?: string
  locatorZh: string
  locatorEn: string
  summaryZh: string
  summaryEn: string
}): GuidelineReference {
  return {
    id: `ADA-2026-${input.id}`,
    title: 'Standards of Care in Diabetes—2026',
    publisher: 'American Diabetes Association',
    version: '2026',
    url: exactUrl(input.sourceUrl, input.targetText),
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
    case 'complete-kidney-risk':
      return [exactReference({
        locale,
        id: '11.1a',
        sourceUrl: KIDNEY_URL,
        targetText: '11.1a Assess kidney function',
        recommendationId: '11.1a',
        evidenceGrade: 'B',
        locatorZh: '第 11 節 → Screening → Recommendation 11.1a',
        locatorEn: 'Section 11 → Screening → Recommendation 11.1a',
        summaryZh: '所有第二型糖尿病人不論治療方式，至少每年以 UACR 與 eGFR 評估腎功能。',
        summaryEn: 'Assess kidney function with UACR and eGFR at least annually in all people with type 2 diabetes, regardless of treatment.',
      })]
    case 'review-egfr-trajectory':
      return [exactReference({
        locale,
        id: '11.1b',
        sourceUrl: KIDNEY_URL,
        targetText: '11.1b In people with chronic kidney disease',
        recommendationId: '11.1b',
        evidenceGrade: 'B',
        locatorZh: '第 11 節 → Screening → Recommendation 11.1b',
        locatorEn: 'Section 11 → Screening → Recommendation 11.1b',
        summaryZh: '已建立 CKD 者，依疾病分期每年監測 UACR 與 eGFR 1–4 次。',
        summaryEn: 'For established CKD, monitor UACR and eGFR one to four times per year according to disease stage.',
      })]
    case 'sglt2-concordance':
      return [exactReference({
        locale,
        id: '9.10',
        sourceUrl: PHARMACOLOGY_URL,
        targetText: '9.10 In adults with type 2 diabetes',
        recommendationId: '9.10',
        evidenceGrade: 'A',
        locatorZh: '第 9 節 → Pharmacologic Approaches → Recommendation 9.10',
        locatorEn: 'Section 9 → Pharmacologic Approaches → Recommendation 9.10',
        summaryZh: '第二型糖尿病合併已確認 CKD（eGFR 20–60 及／或白蛋白尿）時，使用具實證效益的 SGLT2 inhibitor 或 GLP-1 RA。',
        summaryEn: 'For type 2 diabetes with confirmed CKD (eGFR 20–60 and/or albuminuria), use an SGLT2 inhibitor or GLP-1 RA with demonstrated benefit.',
      })]
    case 'glycemic-safety-older-adult':
      return [
        exactReference({
          locale,
          id: '13.7b-13.7c',
          sourceUrl: OLDER_ADULTS_URL,
          targetText: '13.7b Older adults with diabetes and intermediate or complex health',
          recommendationId: '13.7b–13.7c',
          evidenceGrade: 'C',
          locatorZh: '第 13 節 → Treatment Goals → Recommendations 13.7b–13.7c',
          locatorEn: 'Section 13 → Treatment Goals → Recommendations 13.7b–13.7c',
          summaryZh: '依認知、功能、衰弱、共病與預期效益設定較寬鬆目標，優先避免低血糖與有症狀高血糖。',
          summaryEn: 'Set less stringent goals using cognition, function, frailty, comorbidity, and expected benefit, prioritizing avoidance of hypoglycemia and symptomatic hyperglycemia.',
        }),
        exactReference({
          locale,
          id: '13.14a-13.14c',
          sourceUrl: OLDER_ADULTS_URL,
          targetText: '13.14a Deintensify hypoglycemia-causing medications',
          recommendationId: '13.14a–13.14c',
          evidenceGrade: 'B / E / B',
          locatorZh: '第 13 節 → Pharmacologic Therapy → Recommendations 13.14a–13.14c',
          locatorEn: 'Section 13 → Pharmacologic Therapy → Recommendations 13.14a–13.14c',
          summaryZh: '高低血糖風險或治療負擔超過效益時，應依個人目標降階或簡化治療。',
          summaryEn: 'Deintensify or simplify treatment when hypoglycemia risk or treatment burden outweighs benefit, within individualized goals.',
        }),
      ]
    case 'blood-pressure-review':
      return [
        exactReference({
          locale,
          id: '10.1',
          sourceUrl: CARDIOVASCULAR_URL,
          targetText: '10.1 Blood pressure should be measured',
          recommendationId: '10.1',
          evidenceGrade: 'A',
          locatorZh: '第 10 節 → Screening and Diagnosis → Recommendation 10.1',
          locatorEn: 'Section 10 → Screening and Diagnosis → Recommendation 10.1',
          summaryZh: '每次例行門診或至少每 6 個月測量血壓；以標準姿勢測量，必要時檢查臥、坐、站血壓。',
          summaryEn: 'Measure blood pressure at every routine visit or at least every six months using standard technique; check lying, seated, and standing measurements when indicated.',
        }),
        exactReference({
          locale,
          id: '10.3',
          sourceUrl: CARDIOVASCULAR_URL,
          targetText: '10.3 For people with diabetes and hypertension',
          recommendationId: '10.3',
          evidenceGrade: 'B',
          locatorZh: '第 10 節 → Treatment Goals → Recommendation 10.3',
          locatorEn: 'Section 10 → Treatment Goals → Recommendation 10.3',
          summaryZh: '血壓目標應依心血管風險、藥物不良反應與個人偏好共同決策。',
          summaryEn: 'Individualize blood pressure goals through shared decision-making using cardiovascular risk, medication adverse effects, and individual preferences.',
        }),
      ]
    case 'kidney-medication-strategy':
      return [
        exactReference({
          locale,
          id: '11.6a',
          sourceUrl: KIDNEY_URL,
          targetText: '11.6a In nonpregnant people with diabetes and hypertension',
          recommendationId: '11.6a–11.6b',
          evidenceGrade: 'B / A / B',
          locatorZh: '第 11 節 → Blood Pressure and Use of ACE Inhibitors and ARBs → Recommendations 11.6a–11.6b',
          locatorEn: 'Section 11 → Blood Pressure and Use of ACE Inhibitors and ARBs → Recommendations 11.6a–11.6b',
          summaryZh: '糖尿病合併高血壓及白蛋白尿或 eGFR <60 時建議 ACEI／ARB；開始或調整後監測 eGFR 與血鉀。',
          summaryEn: 'For diabetes with hypertension and albuminuria or eGFR below 60, use an ACE inhibitor or ARB and monitor eGFR and potassium after initiation or dose change.',
        }),
        exactReference({
          locale,
          id: '11.8',
          sourceUrl: KIDNEY_URL,
          targetText: '11.8 To reduce CKD progression and cardiovascular events',
          recommendationId: '11.8',
          evidenceGrade: 'A',
          locatorZh: '第 11 節 → Mineralocorticoid Receptor Antagonists → Recommendation 11.8',
          locatorEn: 'Section 11 → Mineralocorticoid Receptor Antagonists → Recommendation 11.8',
          summaryZh: 'CKD 合併白蛋白尿且 eGFR ≥25 時，可使用具實證效益的非類固醇型 MRA，並於開始 1 個月後監測血鉀。',
          summaryEn: 'For CKD with albuminuria and eGFR at least 25, use an effective nonsteroidal MRA and monitor potassium one month after initiation.',
        }),
      ]
    case 'ascvd-lipid-strategy':
      return [
        exactReference({
          locale,
          id: '10.26',
          sourceUrl: CARDIOVASCULAR_URL,
          targetText: '10.26 For people of all ages with diabetes and ASCVD',
          recommendationId: '10.26',
          evidenceGrade: 'A',
          locatorZh: '第 10 節 → Secondary Prevention → Recommendation 10.26',
          locatorEn: 'Section 10 → Secondary Prevention → Recommendation 10.26',
          summaryZh: '所有年齡的糖尿病合併 ASCVD 者，生活型態治療之外應使用高強度 statin。',
          summaryEn: 'For people of all ages with diabetes and ASCVD, add high-intensity statin therapy to lifestyle treatment.',
        }),
        exactReference({
          locale,
          id: '10.27',
          sourceUrl: CARDIOVASCULAR_URL,
          targetText: '10.27 For people with diabetes and ASCVD',
          recommendationId: '10.27–10.28a',
          evidenceGrade: 'A / E',
          locatorZh: '第 10 節 → Secondary Prevention → Recommendations 10.27–10.28a',
          locatorEn: 'Section 10 → Secondary Prevention → Recommendations 10.27–10.28a',
          summaryZh: '使用最大耐受 statin，目標 LDL-C 降低至少 50% 且 <55 mg/dL；無法耐受時仍採最大耐受劑量。',
          summaryEn: 'Use a maximally tolerated statin to lower LDL-C by at least 50% and below 55 mg/dL; use the maximum tolerated dose when the intended intensity is not tolerated.',
        }),
        exactReference({
          locale,
          id: '13.2-lipids',
          sourceUrl: OLDER_ADULTS_URL,
          targetText: 'Very complex/poor health',
          recommendationId: 'Table 13.2',
          locatorZh: '第 13 節 → Table 13.2 → 高齡者血脂治療',
          locatorEn: 'Section 13 → Table 13.2 → lipid treatment in older adults',
          summaryZh: '高齡者需依健康狀態與實際獲益評估 statin；very complex／poor health 應特別考量獲益可能性。',
          summaryEn: 'In older adults, evaluate statin therapy using health status and likelihood of benefit; in very complex/poor health, explicitly consider the likelihood of benefit.',
        }),
      ]
    case 'complication-screening':
      return [
        exactReference({
          locale,
          id: '12.4-12.5',
          sourceUrl: COMPLICATIONS_URL,
          targetText: '12.4 People with type 2 diabetes',
          recommendationId: '12.4–12.5',
          evidenceGrade: 'B',
          locatorZh: '第 12 節 → Retinopathy Screening → Recommendations 12.4–12.5',
          locatorEn: 'Section 12 → Retinopathy Screening → Recommendations 12.4–12.5',
          summaryZh: '第二型糖尿病診斷時即做完整散瞳眼底檢查，後續依結果至少每年或每 1–2 年追蹤。',
          summaryEn: 'Perform an initial dilated eye examination at type 2 diabetes diagnosis and repeat at least annually or every one to two years according to findings.',
        }),
        exactReference({
          locale,
          id: '12.17-12.18',
          sourceUrl: COMPLICATIONS_URL,
          targetText: '12.17 All people with diabetes',
          recommendationId: '12.17–12.18',
          evidenceGrade: 'B',
          locatorZh: '第 12 節 → Neuropathy Screening → Recommendations 12.17–12.18',
          locatorEn: 'Section 12 → Neuropathy Screening → Recommendations 12.17–12.18',
          summaryZh: '第二型糖尿病自診斷起至少每年評估周邊神經病變，包含 128 Hz 音叉與每年 10-g 單股纖維。',
          summaryEn: 'Assess peripheral neuropathy from type 2 diabetes diagnosis and at least annually, including a 128-Hz tuning fork and annual 10-g monofilament testing.',
        }),
        exactReference({
          locale,
          id: '12.23-12.25',
          sourceUrl: COMPLICATIONS_URL,
          targetText: '12.23 Perform a comprehensive foot evaluation',
          recommendationId: '12.23–12.25',
          evidenceGrade: 'A / B / A',
          locatorZh: '第 12 節 → Foot Care → Recommendations 12.23–12.25',
          locatorEn: 'Section 12 → Foot Care → Recommendations 12.23–12.25',
          summaryZh: '至少每年完整足部檢查；有感覺喪失、潰瘍或截肢史者每次門診檢視。',
          summaryEn: 'Perform a comprehensive foot examination at least annually and inspect feet at every visit when sensory loss or prior ulceration or amputation is present.',
        }),
      ]
    case 'older-adult-safety':
      return [
        exactReference({
          locale,
          id: '13.3',
          sourceUrl: OLDER_ADULTS_URL,
          targetText: '13.3 Screening for early detection',
          recommendationId: '13.3',
          evidenceGrade: 'B',
          locatorZh: '第 13 節 → Neurocognitive Function → Recommendation 13.3',
          locatorEn: 'Section 13 → Neurocognitive Function → Recommendation 13.3',
          summaryZh: '65 歲以上應於初診、每年及臨床需要時篩檢輕度認知障礙或失智。',
          summaryEn: 'Screen adults aged 65 years or older for mild cognitive impairment or dementia initially, annually, and as appropriate.',
        }),
        exactReference({
          locale,
          id: '13.4',
          sourceUrl: OLDER_ADULTS_URL,
          targetText: '13.4 Ascertain and address episodes of hypoglycemia',
          recommendationId: '13.4',
          evidenceGrade: 'B',
          locatorZh: '第 13 節 → Hypoglycemia → Recommendation 13.4',
          locatorEn: 'Section 13 → Hypoglycemia → Recommendation 13.4',
          summaryZh: '高齡糖尿病人每次例行門診都應查詢並處理低血糖事件。',
          summaryEn: 'Ascertain and address hypoglycemia episodes at routine visits for older adults with diabetes.',
        }),
      ]
    case 'care-gap-inventory':
      return [
        exactReference({
          locale,
          id: '4.3-4.4',
          sourceUrl: COMPREHENSIVE_URL,
          targetText: '4.3 A complete medical evaluation',
          recommendationId: '4.3–4.4',
          evidenceGrade: 'A / E / B',
          locatorZh: '第 4 節 → Comprehensive Medical Evaluation → Recommendations 4.3–4.4',
          locatorEn: 'Section 4 → Comprehensive Medical Evaluation → Recommendations 4.3–4.4',
          summaryZh: '初診與後續門診應依需要完成整體評估，涵蓋治療、併發症、共病、功能、風險因子與持續照護計畫。',
          summaryEn: 'At initial and follow-up visits, complete an evaluation covering treatment, complications, comorbidities, function, risk factors, and continuing care.',
        }),
        exactReference({
          locale,
          id: 'table-4.1',
          sourceUrl: COMPREHENSIVE_URL,
          targetText: 'Components of the comprehensive diabetes medical evaluation',
          recommendationId: 'Table 4.1',
          locatorZh: '第 4 節 → Table 4.1：初診、每次回診與年度評估項目',
          locatorEn: 'Section 4 → Table 4.1: initial, follow-up, and annual evaluation components',
          summaryZh: '逐項列出初診、每次回診與年度應核對的病史、檢查、檢驗、併發症與自我照護資料。',
          summaryEn: 'Lists the history, examinations, laboratory tests, complications, and self-management items for initial, follow-up, and annual visits.',
        }),
      ]
    case 'immunization-review':
      return [exactReference({
        locale,
        id: 'immunizations',
        sourceUrl: COMPREHENSIVE_URL,
        targetText: 'Immunizations',
        recommendationId: 'Table 4.5',
        locatorZh: '第 4 節 → Immunizations → Table 4.5',
        locatorEn: 'Section 4 → Immunizations → Table 4.5',
        summaryZh: '糖尿病照護應依年齡、既往接種史與當期公衛建議核對流感、COVID-19、肺炎鏈球菌等疫苗。',
        summaryEn: 'Diabetes care includes age-, history-, and season-appropriate review of influenza, COVID-19, pneumococcal, and other vaccines.',
      })]
    default:
      return [{
        id: `ADA-2026-${recommendation.id}`,
        title: 'Standards of Care in Diabetes—2026',
        publisher: 'American Diabetes Association',
        version: '2026',
        url: ISSUE_URL,
        locator: localize(locale, '依臨床領域對應章節', 'Corresponding clinical domain section'),
        summary: localize(
          locale,
          '目前尚未建立此決策的精準條號索引。',
          'An exact recommendation index has not yet been established for this decision.',
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
        summary: localize(locale, '每年至少一次 eGFR＋UACR；依風險決定追蹤與轉介。', 'Check eGFR and UACR at least annually; set monitoring and referral by risk.'),
      }
    case 'review-egfr-trajectory':
      return {
        status: 'recommended',
        summary: localize(locale, 'CKD 依分期每年複查 eGFR＋UACR 1–4 次。', 'In CKD, repeat eGFR and UACR one to four times yearly by stage.'),
      }
    case 'sglt2-concordance':
      return {
        status: 'consider',
        summary: localize(locale, 'T2DM＋CKD：評估 SGLT2 inhibitor／GLP-1 RA；先核對實際用藥與安全條件。', 'T2DM with CKD: evaluate an SGLT2 inhibitor or GLP-1 RA after medication and safety review.'),
      }
    case 'glycemic-safety-older-adult':
      return {
        status: 'recommended',
        summary: localize(locale, '依認知、功能、衰弱與低血糖風險設定目標；必要時簡化或降階。', 'Set goals using cognition, function, frailty, and hypoglycemia risk; simplify or deintensify when needed.'),
      }
    case 'blood-pressure-review':
      return {
        status: 'needs-data',
        summary: localize(locale, '先取得標準化血壓；再依心腎風險與耐受性設定目標。', 'Obtain standardized blood pressure, then set the goal by cardiorenal risk and tolerance.'),
      }
    case 'kidney-medication-strategy':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'consider',
        summary: localize(locale, '高血壓＋白蛋白尿或 eGFR <60：評估 ACEI／ARB；適用時再評估 finerenone。', 'For hypertension with albuminuria or eGFR below 60, assess an ACE inhibitor/ARB and then finerenone when eligible.'),
      }
    case 'ascvd-lipid-strategy':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '糖尿病＋ASCVD：最大耐受 statin；以 LDL-C 判斷是否達標。', 'For diabetes with ASCVD, use a maximally tolerated statin and judge goal attainment using LDL-C.'),
      }
    case 'complication-screening':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '眼底、神經、足部自診斷起篩檢；高風險足每次門診檢視。', 'Screen eyes, nerves, and feet from diagnosis; inspect high-risk feet every visit.'),
      }
    case 'older-adult-safety':
      return {
        status: 'needs-data',
        summary: localize(locale, '65 歲以上：初診及每年篩檢認知；每次門診詢問低血糖。', 'Age 65 or older: screen cognition initially and annually; ask about hypoglycemia every visit.'),
      }
    case 'care-gap-inventory':
      return {
        status: 'needs-data',
        summary: localize(locale, '依 Table 4.1 核對缺少的檢驗、併發症篩檢與用藥資料。', 'Use Table 4.1 to reconcile missing laboratory, complication-screening, and medication data.'),
      }
    case 'immunization-review':
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '依年齡、接種史與當季政策核對流感、COVID-19 與肺炎鏈球菌疫苗。', 'Reconcile influenza, COVID-19, and pneumococcal vaccination by age, history, and current seasonal guidance.'),
      }
    default:
      return {
        status: recommendation.status === 'needs-data' ? 'needs-data' : 'recommended',
        summary: localize(locale, '依 ADA 2026 完成個人化評估，缺少資料先標示未知。', 'Complete the person-centered assessment under ADA 2026 and keep unavailable data explicitly unknown.'),
      }
  }
}

export const ADA_2026_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'ada-2026',
      kind: 'guideline',
      label: localize(locale, 'ADA 2026', 'ADA 2026'),
      version: '2026',
      effectiveFrom: '2026-01-01',
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
