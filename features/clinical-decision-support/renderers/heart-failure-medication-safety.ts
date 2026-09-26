import type { CdssRecommendation } from '../types'

type MedicationSafetyAssessment = {
  status: 'needs-data' | 'review'
  factKeys: readonly string[]
  headlineZh: string
  headlineEn: string
  summaryReasonZh: string
  summaryReasonEn: string
}

const REQUIRED_FACTS: Readonly<Record<string, readonly string[]>> = {
  'heart-failure-ras-inhibition': ['eGFR', 'potassium', 'bloodPressure'],
  'heart-failure-beta-blocker': ['bloodPressure', 'heartRate'],
  'heart-failure-mra': ['eGFR', 'potassium'],
  'heart-failure-sglt2': ['eGFR'],
}

function evidenceValue(recommendation: CdssRecommendation, factKey: string): string | undefined {
  return recommendation.patientEvidence
    .find((evidence) => evidence.factKeys.includes(factKey))
    ?.value
}

function numericEvidence(recommendation: CdssRecommendation, factKey: string): number | undefined {
  const match = evidenceValue(recommendation, factKey)?.match(/-?\d+(?:\.\d+)?/)
  if (!match) return undefined
  const value = Number(match[0])
  return Number.isFinite(value) ? value : undefined
}

function missingAssessment(
  recommendation: CdssRecommendation,
  factKeys: readonly string[],
): MedicationSafetyAssessment | undefined {
  const missing = factKeys.filter((factKey) => numericEvidence(recommendation, factKey) === undefined)
  if (missing.length === 0) return undefined
  const labels: Readonly<Record<string, { zh: string; en: string }>> = {
    bloodPressure: { zh: '血壓', en: 'blood pressure' },
    heartRate: { zh: '心率', en: 'heart rate' },
    eGFR: { zh: 'eGFR', en: 'eGFR' },
    potassium: { zh: 'K', en: 'potassium' },
  }
  return {
    status: 'needs-data',
    factKeys,
    headlineZh: `缺少 ${missing.map((key) => labels[key]?.zh ?? key).join('、')}，補齊後再評估用藥。`,
    headlineEn: `Obtain ${missing.map((key) => labels[key]?.en ?? key).join(', ')} before assessing therapy.`,
    summaryReasonZh: `缺少 ${missing.map((key) => labels[key]?.zh ?? key).join('、')}`,
    summaryReasonEn: `Missing ${missing.map((key) => labels[key]?.en ?? key).join(', ')}`,
  }
}

/**
 * Applies the drug-specific structured gates that the care pack exposes.
 *
 * The released pack currently returns `no-action` for an existing prescription
 * before it evaluates these gates. Keeping this small adapter at the rendering
 * boundary makes the unsafe state visible on the drug's own row until the pack
 * can return the same status directly.
 */
export function heartFailureMedicationSafetyAssessment(
  recommendation: CdssRecommendation,
): MedicationSafetyAssessment | undefined {
  const required = REQUIRED_FACTS[recommendation.id]
  if (!required) return undefined

  const systolic = numericEvidence(recommendation, 'bloodPressure')
  const heartRate = numericEvidence(recommendation, 'heartRate')
  const potassium = numericEvidence(recommendation, 'potassium')
  const eGfr = numericEvidence(recommendation, 'eGFR')

  if (recommendation.id === 'heart-failure-beta-blocker' && heartRate! < 50) {
    return {
      status: 'review',
      factKeys: ['hfEvidenceBetaBlockerTherapy', 'heartRate', 'bloodPressure'],
      headlineZh: `心率 ${heartRate} bpm（<50），確認症狀、心律與實際用藥後，評估 β 阻斷劑維持、減量或暫緩。`,
      headlineEn: `Heart rate is ${heartRate} bpm (<50). Review symptoms, rhythm, and actual use before continuing, reducing, or holding the beta-blocker.`,
      summaryReasonZh: `心率 ${heartRate} bpm（<50）`,
      summaryReasonEn: `HR ${heartRate} bpm (<50)`,
    }
  }

  if (recommendation.id === 'heart-failure-ras-inhibition') {
    const concernsZh = [
      ...(systolic! < 100 ? [`收縮壓 ${systolic} mmHg`] : []),
      ...(eGfr! < 30 ? [`eGFR ${eGfr}`] : []),
      ...(potassium! > 5.2 ? [`K ${potassium} mmol/L`] : []),
    ]
    const concernsEn = [
      ...(systolic! < 100 ? [`systolic BP ${systolic} mmHg`] : []),
      ...(eGfr! < 30 ? [`eGFR ${eGfr}`] : []),
      ...(potassium! > 5.2 ? [`potassium ${potassium} mmol/L`] : []),
    ]
    const summaryConcernsZh = [
      ...(systolic! < 100 ? [`收縮壓 ${systolic} mmHg（<100）`] : []),
      ...(eGfr! < 30 ? [`eGFR ${eGfr}（<30）`] : []),
      ...(potassium! > 5.2 ? [`K ${potassium} mmol/L（>5.2）`] : []),
    ]
    const summaryConcernsEn = [
      ...(systolic! < 100 ? [`SBP ${systolic} mmHg (<100)`] : []),
      ...(eGfr! < 30 ? [`eGFR ${eGfr} (<30)`] : []),
      ...(potassium! > 5.2 ? [`K ${potassium} mmol/L (>5.2)`] : []),
    ]
    if (concernsZh.length > 0) {
      return {
        status: 'review',
        factKeys: [
          recommendation.overviewEvidenceFactKey ?? 'arniTherapy',
          'bloodPressure',
          'eGFR',
          'potassium',
        ],
        headlineZh: `${concernsZh.join('、')}，先確認耐受性與安全性，再評估 ARNI／ACEI／ARB。`,
        headlineEn: `${concernsEn.join(', ')}. Review tolerability and safety before assessing ARNI/ACE inhibitor/ARB therapy.`,
        summaryReasonZh: summaryConcernsZh.join('、'),
        summaryReasonEn: summaryConcernsEn.join('; '),
      }
    }
  }

  if (recommendation.id === 'heart-failure-mra' && (potassium! >= 5 || eGfr! <= 30)) {
    const concernsZh = [
      ...(potassium! >= 5 ? [`K ${potassium} mmol/L`] : []),
      ...(eGfr! <= 30 ? [`eGFR ${eGfr}`] : []),
    ]
    const concernsEn = [
      ...(potassium! >= 5 ? [`potassium ${potassium} mmol/L`] : []),
      ...(eGfr! <= 30 ? [`eGFR ${eGfr}`] : []),
    ]
    const summaryConcernsZh = [
      ...(potassium! >= 5 ? [`K ${potassium} mmol/L（≥5.0）`] : []),
      ...(eGfr! <= 30 ? [`eGFR ${eGfr}（≤30）`] : []),
    ]
    const summaryConcernsEn = [
      ...(potassium! >= 5 ? [`K ${potassium} mmol/L (≥5.0)`] : []),
      ...(eGfr! <= 30 ? [`eGFR ${eGfr} (≤30)`] : []),
    ]
    return {
      status: 'review',
      factKeys: ['mraTherapy', 'potassium', 'eGFR'],
      headlineZh: `${concernsZh.join('、')}，未符合 MRA 起始安全門檻，需臨床確認。`,
      headlineEn: `${concernsEn.join(', ')} does not meet the MRA initiation safety gate; clinical review is required.`,
      summaryReasonZh: summaryConcernsZh.join('、'),
      summaryReasonEn: summaryConcernsEn.join('; '),
    }
  }

  if (recommendation.id === 'heart-failure-sglt2' && eGfr! < 20) {
    return {
      status: 'review',
      factKeys: ['sglt2Therapy', 'eGFR'],
      headlineZh: `eGFR ${eGfr}（<20），低於本模組的 SGLT2i 起始門檻，需臨床確認。`,
      headlineEn: `eGFR is ${eGfr} (<20), below this module's SGLT2 inhibitor initiation threshold; clinical review is required.`,
      summaryReasonZh: `eGFR ${eGfr}（<20）`,
      summaryReasonEn: `eGFR ${eGfr} (<20)`,
    }
  }

  // The pack already marks a new prescription as needs-data. This catches the
  // defect specific to an existing prescription: its early `no-action` return
  // used to conceal absent monitoring inputs as well as abnormal ones.
  if (recommendation.status === 'no-action' && (recommendation.missingData?.length ?? 0) > 0) {
    const missing = missingAssessment(recommendation, required)
    if (missing) return missing
  }

  return undefined
}

export function applyHeartFailureMedicationSafety(
  recommendation: CdssRecommendation,
): CdssRecommendation {
  const assessment = heartFailureMedicationSafetyAssessment(recommendation)
  if (!assessment) return recommendation
  const headline = recommendation.title.match(/[\u3400-\u9fff]/)
    ? assessment.headlineZh
    : assessment.headlineEn
  return {
    ...recommendation,
    status: assessment.status,
    priority: recommendation.priority === 'high' ? 'high' : 'medium',
    overviewEvidenceFactKeys: assessment.factKeys,
    nextActions: [headline, ...recommendation.nextActions.filter((action) => action !== headline)],
  }
}
