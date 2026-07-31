import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssRecommendation,
  GuidelineReference,
} from '../types'
import { assessment, localize, pdfPageUrl } from './shared'

const GUIDELINE_URL = 'https://www.tsn.org.tw/archive/20251203/4b7b9dd5-ba8d-405f-bea8-cf6868ba054b/4b7b9dd5-ba8d-405f-bea8-cf6868ba054b.pdf'

function reference(input: {
  locale: CdssLocale
  id: string
  page: number
  printedPage?: string
  recommendationId: string
  locatorZh: string
  locatorEn: string
  summaryZh: string
  summaryEn: string
  evidenceGrade?: string
  citedStatements?: readonly {
    label: string
    text: string
  }[]
}): GuidelineReference {
  return {
    id: `TW-CKD-2025-${input.id}`,
    title: localize(
      input.locale,
      '臺灣慢性腎臟病臨床指引專書',
      'Taiwan Clinical Practice Guidelines for Chronic Kidney Disease',
    ),
    publisher: localize(input.locale, '台灣腎臟醫學會', 'Taiwan Society of Nephrology'),
    version: '2025-12 update',
    url: pdfPageUrl(GUIDELINE_URL, input.page),
    page: input.page,
    printedPage: input.printedPage,
    recommendationId: input.recommendationId,
    evidenceGrade: input.evidenceGrade,
    locator: localize(input.locale, input.locatorZh, input.locatorEn),
    summary: localize(input.locale, input.summaryZh, input.summaryEn),
    citedStatements: input.citedStatements,
  }
}

function references(
  locale: CdssLocale,
  recommendation: CdssRecommendation,
): GuidelineReference[] {
  switch (recommendation.id) {
    case 'ckd-classification':
    case 'ckd-monitoring':
      return [reference({
        locale,
        id: 'A4-1-1',
        page: 49,
        printedPage: '046',
        recommendationId: 'A4-1-1',
        evidenceGrade: '1B',
        locatorZh: 'Part A 第 4 章 → CKD 定義、診斷與分期',
        locatorEn: 'Part A, Chapter 4 → CKD definition, diagnosis, and staging',
        summaryZh: '診斷 CKD 後，應依病因、GFR 與 UACR 分期；腎臟結構或功能異常需持續超過 3 個月。',
        summaryEn: 'After CKD diagnosis, classify by cause, GFR, and UACR; kidney structure or function abnormalities must persist for more than 3 months.',
        citedStatements: [{
          label: 'A4-1-1',
          text: '我們建議診斷 CKD 後，應根據病因、GFR 和尿液白蛋白與尿液肌酸酐比值進行分期。',
        }],
      })]
    case 'ckd-kidney-failure-risk':
    case 'ckd-referral-care':
      return [
        reference({
          locale,
          id: 'A9-1-1',
          page: 195,
          printedPage: '192',
          recommendationId: 'A9-1-1',
          evidenceGrade: '1B',
          locatorZh: 'Part A 第 9 章 → 早期 CKD 轉介',
          locatorEn: 'Part A, Chapter 9 → referral in early CKD',
          summaryZh: '早期 CKD 在快速惡化、顯著蛋白尿／白蛋白尿、血尿合併蛋白尿、難治型高血壓、持續鉀異常或兩年內進入末期腎病高風險時應轉介。',
          summaryEn: 'Refer early CKD for rapid progression, significant proteinuria or albuminuria, hematuria with proteinuria, refractory hypertension, persistent potassium abnormalities, or high 2-year kidney-failure risk.',
          citedStatements: [{
            label: 'A9-1-1',
            text: '對於早期 CKD（CKD1～3 期）之腎臟科轉介的指引如下：\n1. CKD 合併快速腎損傷（每年下降超過 5 ml/min/1.73 m²）。\n2. 不明原因顯著白蛋白尿（單次尿檢白蛋白超過 300 mg/尿中肌酸酐（克）或 24 hours 尿檢白蛋白超過 300 mg）。蛋白尿（UPCR > 1000 mg/g [100 mg/mmol]；24 hours 尿檢蛋白超過 1000 mg）\n3. 不明原因持續性血尿（尿中紅血球 > 20 高倍下）合併蛋白尿（UPCR > 500 mg/g [50 mg/mmol]）；或尿液紅血球圓柱體。\n4. CKD 合併高血壓需要用到四種以上降血壓藥物。\n5. 持續的血鉀異常。\n6. 遺傳性腎病。\n7. 腎臟結構性異常。\n8. 反覆性、廣泛性腎結石。\n9. 兩年內進入末期腎病高風險（參考網站 https://kidneyfailurerisk.com）',
          }],
        }),
        reference({
          locale,
          id: 'A9-2-1-2',
          page: 196,
          printedPage: '193',
          recommendationId: 'A9-2-1 to A9-2-2',
          evidenceGrade: '1B / 2B',
          locatorZh: 'Part A 第 9 章 → 多專科團隊照護',
          locatorEn: 'Part A, Chapter 9 → multidisciplinary care',
          summaryZh: 'CKD G4-G5 建議轉腎臟專科；糖尿病腎臟病可在 G3b 提早轉介。',
          summaryEn: 'Refer CKD G4-G5 to nephrology; consider earlier referral at G3b for diabetic kidney disease.',
          citedStatements: [
            {
              label: 'A9-2-1',
              text: '所有重度 CKD（第 4～5 期）皆建議轉至腎臟科專科。',
            },
            {
              label: 'A9-2-2',
              text: '我們認為糖尿病腎臟病患可提早第 3b 期轉介，可減緩第 3～4 期 CKD 病人進展至第 5 期。',
            },
          ],
        }),
      ]
    case 'ckd-sglt2-strategy':
      return [reference({
        locale,
        id: 'A8-1-4',
        page: 166,
        printedPage: '163',
        recommendationId: 'A8-1-4-1 to A8-1-4-2',
        evidenceGrade: '1A / 1B',
        locatorZh: 'Part A 第 8 章 → SGLT2 抑制劑',
        locatorEn: 'Part A, Chapter 8 → SGLT2 inhibitors',
        summaryZh: '糖尿病與非糖尿病 CKD 在適用腎功能範圍內，SGLT2 抑制劑可降低 GFR 下降與末期腎病風險；仍需依新版條件與個別安全性評估。',
        summaryEn: 'For diabetic and nondiabetic CKD within the applicable kidney-function range, SGLT2 inhibitors reduce GFR decline and kidney-failure risk; apply current eligibility and individual safety review.',
        citedStatements: [
          {
            label: 'A8-1-4-1',
            text: '對於 eGFR > 30 ml/min/1.73 m² 的第 2 型糖尿病患者，建議使用 SGLT2i 治療，有助於減少 GFR 下降，末期腎臟病發生和腎臟相關的死亡率',
          },
          {
            label: 'A8-1-4-2',
            text: '對於 eGFR > 30 ml/min/1.73 m² 的非第 2 型糖尿病 CKD 患者，建議使用 SGLT2i 治療，有助於減少 GFR 下降，末期腎臟病發生和腎臟相關的死亡率',
          },
        ],
      })]
    case 'ckd-anemia-monitoring':
      return [reference({
        locale,
        id: 'B4',
        page: 307,
        printedPage: '304',
        recommendationId: 'B4-1-1 to B4-1-4',
        locatorZh: 'Part B 第 4 章 → 腎性貧血',
        locatorEn: 'Part B, Chapter 4 → anemia in CKD',
        summaryZh: '依 CKD 分期與臨床狀況評估血紅素、鐵狀態及其他腎性貧血原因；並同步留意電解質、酸鹼與 CKD-MBD。',
        summaryEn: 'Assess hemoglobin, iron status, and other causes of anemia according to CKD stage and clinical context, alongside electrolytes, acid-base status, and CKD-MBD.',
        citedStatements: [
          {
            label: 'B4-1-1',
            text: '診斷 CKD 後，不論其分期及病因為何，我們認為所有病患都可以檢測血紅素濃度。',
          },
          {
            label: 'B4-1-2',
            text: 'CKD 患者若貧血，我們認為初始評估可以包含全血球數、各類白血球數、網狀紅血球數、鐵蛋白、運鐵蛋白飽和度等項目，若有大球性貧血出現時，可增加測量維生素 B12 和葉酸濃度。',
          },
          {
            label: 'B4-1-3',
            text: '我們認為目前未患貧血的 CKD 患者可依下列頻率監測：第 3 期 CKD 患者，至少每年檢測一次血紅素；第 4、5 期未透析患者，至少每年檢測兩次血紅素。',
          },
          {
            label: 'B4-1-4',
            text: '我們認為貧血且未使用血紅素生成刺激劑（erythropoietin stimulating agents）治療的 CKD 患者可依下列頻率監測：第 3～5 期未透析患者，至少每三個月檢測一次血紅素。',
          },
        ],
      })]
    default:
      return []
  }
}

export const TAIWAN_CKD_2025_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'taiwan-ckd-2025',
      kind: 'guideline',
      label: localize(locale, '台灣 CKD 指引', 'Taiwan CKD guideline'),
      version: '2025-12 update',
      effectiveFrom: '2025-12-02',
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
        '依台灣 2025 年 12 月更新版 CKD 指引，以本土分期、轉介與照護流程進行評估。',
        'Apply the December 2025 Taiwan CKD guideline using local staging, referral, and care pathways.',
      ),
      missingData: recommendation.status === 'needs-data'
        ? recommendation.missingData
        : undefined,
      references: references(locale, recommendation),
    })
  },
}
