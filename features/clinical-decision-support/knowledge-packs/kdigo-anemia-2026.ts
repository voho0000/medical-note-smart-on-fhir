import type {
  CdssKnowledgePack,
  CdssLocale,
  CdssPatientProfile,
  GuidelineReference,
} from '../types'
import { assessment, localize, pdfPageUrl } from './shared'

const GUIDELINE_URL = 'https://kdigo.org/wp-content/uploads/2026/04/KDIGO-2026-Anemia-in-CKD-Guideline.pdf'

function numberFromFact(profile: CdssPatientProfile, key: string): number | undefined {
  const value = profile.facts[key]?.numericValue
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function reference(
  locale: CdssLocale,
  id: string,
  recommendationId: string,
  page: number,
  locatorZh: string,
  locatorEn: string,
  summaryZh: string,
  summaryEn: string,
): GuidelineReference {
  return {
    id: `KDIGO-ANEMIA-2026-${id}`,
    title: 'KDIGO 2026 Clinical Practice Guideline for the Management of Anemia in Chronic Kidney Disease',
    publisher: 'Kidney Disease: Improving Global Outcomes',
    version: '2026',
    url: pdfPageUrl(GUIDELINE_URL, page),
    page,
    recommendationId,
    locator: localize(locale, locatorZh, locatorEn),
    summary: localize(locale, summaryZh, summaryEn),
  }
}

export const KDIGO_ANEMIA_2026_PACK: CdssKnowledgePack = {
  enabled: true,
  metadata(locale) {
    return {
      id: 'kdigo-anemia-2026',
      kind: 'guideline',
      label: localize(locale, 'KDIGO 貧血指引', 'KDIGO anemia guideline'),
      version: '2026',
      effectiveFrom: '2026-04-17',
    }
  },
  assess({ profile, recommendation, locale }) {
    const metadata = this.metadata(locale)
    const supportedRecommendationIds = new Set([
      'ckd-anemia-monitoring',
      'ckd-anemia-detection-monitoring',
      'ckd-anemia-initial-evaluation',
      'ckd-anemia-iron-pathway',
      'ckd-anemia-expanded-evaluation-esa-safety',
    ])
    if (!supportedRecommendationIds.has(recommendation.id)) {
      return assessment({
        sourceId: metadata.id,
        sourceKind: metadata.kind,
        sourceLabel: metadata.label,
        version: metadata.version,
        effectiveFrom: metadata.effectiveFrom,
        status: 'not-applicable',
        summary: localize(
          locale,
          '此來源只評估 CKD 貧血監測與處置前提。',
          'This source applies only to CKD anemia monitoring and treatment prerequisites.',
        ),
      })
    }

    const hemoglobin = numberFromFact(profile, 'hemoglobin')
    const sex = profile.demographics?.sex
    const threshold = sex === 'male' ? 13 : sex === 'female' ? 12 : undefined
    const hasAnemia = (
      hemoglobin !== undefined
      && threshold !== undefined
      && hemoglobin < threshold
    )
    const missingData = [
      ...(hemoglobin === undefined
        ? [localize(locale, '血紅素與採檢日期', 'Hemoglobin and collection date')]
        : []),
      ...(threshold === undefined
        ? [localize(locale, '可用於貧血門檻判讀的性別資料', 'Sex data needed for the anemia threshold')]
        : []),
      ...(hasAnemia
        ? [
            localize(locale, 'CBC 連續趨勢與網狀紅血球', 'CBC trend and reticulocyte count'),
            localize(locale, 'ferritin 與 TSAT', 'Ferritin and TSAT'),
          ]
        : []),
    ]

    return assessment({
      sourceId: metadata.id,
      sourceKind: metadata.kind,
      sourceLabel: metadata.label,
      version: metadata.version,
      effectiveFrom: metadata.effectiveFrom,
      status: hemoglobin === undefined || threshold === undefined
        ? 'needs-data'
        : hasAnemia
          ? 'recommended'
          : 'consider',
      summary: hasAnemia
        ? localize(
            locale,
            `Hb ${hemoglobin} g/dL 低於${sex === 'male' ? '男性 13' : '女性 12'} g/dL 門檻；先完成貧血原因與鐵狀態評估，單一輕度數值不直接觸發 ESA。`,
            `Hemoglobin ${hemoglobin} g/dL is below the ${sex === 'male' ? 'male 13' : 'female 12'} g/dL threshold. Complete anemia-cause and iron-status evaluation first; a single mild value does not trigger ESA therapy.`,
          )
        : localize(
            locale,
            '目前血紅素未達此指引的性別特異貧血門檻；仍依 CKD 分期與趨勢追蹤。',
            'Current hemoglobin does not meet the guideline sex-specific anemia threshold; continue monitoring by CKD stage and trend.',
          ),
      verifiedData: hemoglobin !== undefined
        ? [localize(locale, `Hb ${hemoglobin} g/dL`, `Hemoglobin ${hemoglobin} g/dL`)]
        : undefined,
      missingData: missingData.length > 0 ? missingData : undefined,
      references: [
        reference(
          locale,
          'definition-evaluation',
          'Practice Point 1.2.1',
          34,
          '第 1 章 → 貧血與鐵缺乏的診斷評估',
          'Chapter 1 → diagnosis and evaluation of anemia and iron deficiency',
          '成人男性 Hb <13 g/dL、女性 Hb <12 g/dL 定義為貧血；初始評估包含 CBC、網狀紅血球、ferritin 與 TSAT。',
          'Anemia is defined as hemoglobin below 13 g/dL in adult males and below 12 g/dL in adult females; initial evaluation includes CBC, reticulocytes, ferritin, and TSAT.',
        ),
        reference(
          locale,
          'esa-initiation',
          'Recommendation 3.2.2',
          52,
          '第 3 章 → 非透析 CKD 的 ESA 起始',
          'Chapter 3 → ESA initiation in CKD not receiving dialysis',
          '非透析 CKD 的 ESA 起始需依症狀、輸血風險與心血管風險個人化，不由單一輕度 Hb 下降自動觸發。',
          'ESA initiation in nondialysis CKD is individualized using symptoms, transfusion risk, and cardiovascular risk rather than triggered automatically by a single mildly low hemoglobin.',
        ),
      ],
    })
  },
}
