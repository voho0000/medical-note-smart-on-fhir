import type {
  CdssLocale,
  CdssMedicationClassId,
  CdssMedicationClassState,
  CdssPatientProfile,
  CdssRecommendation,
  ClinicalEvidence,
  ClinicalGuidelinePack,
} from '../types'
import { attachKnowledgeAssessments } from '../knowledge-packs/registry'
import { calculateKfre, type KfreSex } from '@/src/core/clinical-calculators/kfre'
import {
  assessLatestEgfrChange,
  ckdStageFromDiagnosis,
  classifyEgfr,
  classifyUacr,
  type CkdGStage,
} from '../risk-stratification/ckd'
import { IMMUNIZATION_CLINICAL_MODULE } from '../clinical-modules/immunization-module'

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function numberFromFact(profile: CdssPatientProfile, key: string): number | undefined {
  const value = profile.facts[key]?.numericValue
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function patientEvidence(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  key: string,
  labelZh: string,
  labelEn: string,
): ClinicalEvidence | undefined {
  const fact = profile.facts[key]
  if (!fact) return undefined
  return {
    label: text(locale, labelZh, labelEn),
    value: fact[locale === 'en' ? 'en' : 'zh'],
    factKeys: [key],
    sources: fact.sources,
  }
}

function compactEvidence(
  values: readonly (ClinicalEvidence | undefined)[],
): ClinicalEvidence[] {
  return values.filter((value): value is ClinicalEvidence => Boolean(value))
}

function medicationClassState(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): CdssMedicationClassState {
  return profile.medicationClassContexts?.[classId]?.state ?? 'not-found'
}

function stageFromProfile(profile: CdssPatientProfile): CkdGStage | undefined {
  return classifyEgfr(numberFromFact(profile, 'eGFR'))
    ?? ckdStageFromDiagnosis(profile.diseasePackEligibility?.['ckd-poc']?.code)
}

function quantitativeUacrFromProfile(
  profile: CdssPatientProfile,
): number | undefined {
  return numberFromFact(profile, 'urineAlbuminRatioQuantitative')
    ?? (
      profile.observationContexts?.uacr?.useState === 'quantitative_comparable'
        ? numberFromFact(profile, 'urineAlbuminRatio')
        : undefined
    )
}

function bloodPressureValues(
  profile: CdssPatientProfile,
): { systolic: number; diastolic: number } | undefined {
  const value = profile.facts.bloodPressure?.sources?.[0]?.value
  if (typeof value !== 'string') return undefined
  const match = value.match(/^(\d{2,3})\/(\d{2,3})$/)
  if (!match) return undefined
  return {
    systolic: Number(match[1]),
    diastolic: Number(match[2]),
  }
}

function isAdvancedCkd(stage: CkdGStage | undefined): boolean {
  return stage === 'G3b' || stage === 'G4' || stage === 'G5'
}

function isG3ToG5(stage: CkdGStage | undefined): boolean {
  return stage === 'G3a' || isAdvancedCkd(stage)
}

function buildClassification(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const eGfr = numberFromFact(profile, 'eGFR')
  const quantitativeUacr = numberFromFact(profile, 'urineAlbuminRatioQuantitative')
    ?? (
      profile.observationContexts?.uacr?.useState === 'quantitative_comparable'
        ? numberFromFact(profile, 'urineAlbuminRatio')
        : undefined
    )
  const gStage = stageFromProfile(profile)
  const aStage = classifyUacr(quantitativeUacr)
  const hasSemiquantitativeUacr = (
    profile.observationContexts?.uacr?.latestReading?.kind === 'semiquantitative'
  )
  const missing: string[] = []
  if (eGfr === undefined) {
    missing.push(text(locale, '可比較的近期 eGFR', 'A recent comparable eGFR'))
  }
  if (quantitativeUacr === undefined) {
    missing.push(text(locale, '定量 UACR（mg/g）', 'Quantitative UACR (mg/g)'))
  }

  const stageLabel = `${gStage ?? 'G?'} / ${aStage ?? 'A?'}`
  return {
    id: 'ckd-classification',
    domain: 'diagnosis',
    priority: missing.length > 0 ? 'medium' : 'routine',
    status: missing.length > 0 ? 'needs-data' : 'no-action',
    overviewEvidenceFactKey: profile.facts.urineAlbuminOverview
      ? 'urineAlbuminOverview'
      : profile.facts.eGFR
        ? 'eGFR'
        : 'ckdDiagnosis',
    title: missing.length > 0
      ? text(
          locale,
          `CKD 分期目前為 ${stageLabel}；補齊定量 UACR 完成 G/A 風險分層`,
          `CKD classification is ${stageLabel}; obtain quantitative UACR to complete G/A risk stratification`,
        )
      : text(
          locale,
          `CKD 已完成 G/A 分期：${stageLabel}`,
          `CKD G/A classification complete: ${stageLabel}`,
        ),
    recommendation: text(
      locale,
      hasSemiquantitativeUacr
        ? '病歷已有半定量 UACR，但不可直接轉換成 KDIGO A1/A2/A3；保留原始結果並補做定量 UACR。'
        : missing.length > 0
          ? '依病因、eGFR 與定量 UACR 完成 CKD 分期；單次異常不作為慢性化的唯一證據。'
          : '以目前 eGFR 與定量 UACR 維持 G/A 分期，後續依風險層級安排追蹤。',
      hasSemiquantitativeUacr
        ? 'A semiquantitative UACR is present but cannot be converted directly to KDIGO A1/A2/A3. Preserve the original result and obtain a quantitative UACR.'
        : missing.length > 0
          ? 'Complete CKD classification using cause, eGFR, and quantitative UACR; do not use a single abnormal result as the sole evidence of chronicity.'
          : 'Maintain the G/A classification using the current eGFR and quantitative UACR, and monitor according to risk.',
    ),
    rationale: text(
      locale,
      'CKD 風險與後續追蹤頻率需同時使用 GFR 與白蛋白尿分級。',
      'CKD risk and monitoring frequency require both GFR and albuminuria categories.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'ckdDiagnosis', 'CKD 診斷', 'CKD diagnosis'),
      patientEvidence(profile, locale, 'ckdChronicity', '慢性化證據', 'Chronicity evidence'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'urineAlbuminOverview', '尿白蛋白', 'Urine albumin'),
    ]),
    missingData: missing,
    nextActions: missing.length > 0
      ? [text(
          locale,
          '先查找完整病歷；若沒有近期定量結果，安排 eGFR 與定量 UACR。',
          'Search the complete chart first; if no recent quantitative result exists, obtain eGFR and quantitative UACR.',
        )]
      : [text(
          locale,
          '依 G/A 風險層級與既有照護計畫安排後續追蹤。',
          'Schedule follow-up according to the G/A risk category and current care plan.',
        )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '半定量或無單位結果不會被推算成定量 UACR；單次低 eGFR 不會自動診斷 CKD。',
      'Semiquantitative or unitless results are not converted to quantitative UACR, and a single low eGFR does not automatically establish CKD.',
    ),
  }
}

function buildMonitoring(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const trend = profile.facts.eGFRTrend
  const change = assessLatestEgfrChange(trend?.sources)
  const current = profile.freshnessContexts?.eGFR?.state === 'current'
  const needsUpdate = !profile.facts.eGFR || !current
  const status = change?.exceedsExpectedVariability
    ? 'review'
    : needsUpdate || !change
      ? 'needs-data'
      : 'no-action'
  const priority = change?.exceedsExpectedVariability ? 'high' : status === 'needs-data' ? 'medium' : 'routine'
  const changeText = change
    ? `${change.percentChange >= 0 ? '+' : ''}${change.percentChange.toFixed(1)}%`
    : undefined

  return {
    id: 'ckd-monitoring',
    domain: 'monitoring',
    priority,
    status,
    overviewEvidenceFactKey: trend ? 'eGFRTrend' : 'eGFR',
    title: change?.exceedsExpectedVariability
      ? text(
          locale,
          `最近兩次 eGFR 變化 ${changeText}，超過 20% 預期變異範圍`,
          `The latest two eGFR values changed by ${changeText}, exceeding expected variability of 20%`,
        )
      : status === 'no-action'
        ? text(
            locale,
            `最近兩次 eGFR 變化 ${changeText}，未超過 20%`,
            `The latest two eGFR values changed by ${changeText}, not exceeding 20%`,
          )
        : text(
            locale,
            '需要近期且可比較的 eGFR 趨勢',
            'A recent comparable eGFR trend is needed',
          ),
    recommendation: text(
      locale,
      change?.exceedsExpectedVariability
        ? '先確認採檢條件、近期急性病況、體液狀態與藥物變動，再評估是否為真實腎功能惡化。'
        : status === 'no-action'
          ? '目前未見超過 20% 的後續 eGFR 變化；仍依 CKD 風險與臨床狀況追蹤。'
          : '先查找近期 eGFR；若只有單一數值，需建立可比較的後續趨勢。',
      change?.exceedsExpectedVariability
        ? 'Confirm collection conditions, recent acute illness, volume status, and medication changes before determining whether true kidney-function deterioration occurred.'
        : status === 'no-action'
          ? 'No subsequent eGFR change over 20% is evident; continue monitoring according to CKD risk and clinical context.'
          : 'Search for a recent eGFR first; if only one value is available, establish a comparable follow-up trend.',
    ),
    rationale: text(
      locale,
      'KDIGO 將後續 eGFR 變化超過 20% 視為超過預期變異，需進一步評估。',
      'KDIGO considers a subsequent eGFR change over 20% to exceed expected variability and warrant evaluation.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'eGFRTrend', 'eGFR 趨勢', 'eGFR trend'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
    ]),
    missingData: status === 'needs-data'
      ? [text(locale, '至少兩次有日期且單位可比較的 eGFR', 'At least two dated eGFR values with comparable units')]
      : [],
    nextActions: change?.exceedsExpectedVariability
      ? [text(
          locale,
          '核對完整病歷並依臨床狀況複驗；不要只由兩個數值自動診斷進展。',
          'Review the complete chart and repeat testing as clinically appropriate; do not diagnose progression automatically from two values.',
        )]
      : [text(
          locale,
          '依 G/A 風險與既有照護計畫安排下一次 eGFR 與 UACR。',
          'Schedule the next eGFR and UACR according to G/A risk and the current care plan.',
        )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '20% 是觸發評估的變化閾值，不等同自動診斷 CKD 進展或急性腎損傷。',
      'The 20% threshold triggers evaluation; it does not automatically diagnose CKD progression or acute kidney injury.',
    ),
  }
}

function buildKidneyFailureRisk(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const gStage = stageFromProfile(profile)
  if (!gStage || gStage === 'G1' || gStage === 'G2') return undefined
  const age = numberFromFact(profile, 'age')
  const eGfr = numberFromFact(profile, 'eGFR')
  const uacrContext = profile.observationContexts?.uacr
  const latestUacrReading = uacrContext?.latestReading ?? uacrContext?.readings?.[0]
  const quantitativeUacrIsCurrent = (
    !profile.freshnessContexts?.quantitativeUacr
    || profile.freshnessContexts.quantitativeUacr.state === 'current'
  )
  const quantitativeUacrCandidate = latestUacrReading
    ? (
        latestUacrReading.kind === 'quantitative'
          ? latestUacrReading.numericValueMgG
          : undefined
      )
    : (
        numberFromFact(profile, 'urineAlbuminRatioQuantitative')
        ?? (
          uacrContext?.useState === 'quantitative_comparable'
            ? numberFromFact(profile, 'urineAlbuminRatio')
            : undefined
        )
      )
  const quantitativeUacr = quantitativeUacrIsCurrent
    ? quantitativeUacrCandidate
    : undefined
  const semiquantitativeLowerBound = (
    quantitativeUacr === undefined
    && latestUacrReading?.kind === 'semiquantitative'
    && latestUacrReading.lowerBoundMgG !== undefined
    && latestUacrReading.lowerBoundMgG > 0
  )
    ? latestUacrReading.lowerBoundMgG
    : undefined
  const kfreUacrInput = quantitativeUacr ?? semiquantitativeLowerBound
  const isLowerBoundScenario = semiquantitativeLowerBound !== undefined
  const demographicSex = profile.demographics?.sex
  const sex: KfreSex | undefined = demographicSex === 'male' || demographicSex === 'female'
    ? demographicSex
    : undefined
  const risk = (
    age !== undefined
    && eGfr !== undefined
    && kfreUacrInput !== undefined
    && kfreUacrInput > 0
    && sex
  )
    ? calculateKfre({
        ageYears: age,
        sex,
        egfrMlMin173m2: eGfr,
        urineAcrMgG: kfreUacrInput,
        calibration: 'non-north-america',
      })
    : null

  const twoYearRisk = risk?.twoYearRiskPercent
  const fiveYearRisk = risk?.fiveYearRiskPercent
  const twoYearText = twoYearRisk?.toFixed(1)
  const fiveYearText = fiveYearRisk?.toFixed(1)
  const exceedsKrtPreparation = twoYearRisk !== undefined && twoYearRisk > 40
  const exceedsMultidisciplinaryCare = twoYearRisk !== undefined && twoYearRisk > 10
  const reachesReferralRange = fiveYearRisk !== undefined && fiveYearRisk >= 3
  const priority: CdssRecommendation['priority'] = !risk
    ? 'high'
    : isLowerBoundScenario
      ? (
          exceedsKrtPreparation || exceedsMultidisciplinaryCare
            ? 'high'
            : 'medium'
        )
    : exceedsKrtPreparation || exceedsMultidisciplinaryCare
      ? 'high'
      : reachesReferralRange
        ? 'medium'
        : 'routine'
  const status: CdssRecommendation['status'] = !risk
    ? 'needs-data'
    : isLowerBoundScenario
      ? 'needs-data'
    : exceedsKrtPreparation || exceedsMultidisciplinaryCare
      ? 'actionable'
      : reachesReferralRange
        ? 'review'
        : 'no-action'

  const riskTitle = risk
    ? text(
        locale,
        isLowerBoundScenario
          ? `KFRE 下限情境｜${gStage}：以 UACR ${semiquantitativeLowerBound} mg/g 代入，2 年至少 ${twoYearText}%／5 年至少 ${fiveYearText}%`
          : `KFRE｜${gStage}：2 年 ${twoYearText}%／5 年 ${fiveYearText}%`,
        isLowerBoundScenario
          ? `KFRE lower-bound scenario | ${gStage}: using UACR ${semiquantitativeLowerBound} mg/g, at least ${twoYearText}% at 2 years / ${fiveYearText}% at 5 years`
          : `KFRE | ${gStage}: ${twoYearText}% at 2 years / ${fiveYearText}% at 5 years`,
      )
    : undefined
  const recommendation = risk && isLowerBoundScenario
    ? (
        exceedsKrtPreparation
          ? text(
              locale,
              `以半定量 UACR 下限 ${semiquantitativeLowerBound} mg/g 計算時，2 年風險已至少 ${twoYearText}% 並超過 40%；應儘速取得定量 UACR，並結合臨床情境評估腎臟替代治療準備。`,
              `Using the semiquantitative UACR lower bound of ${semiquantitativeLowerBound} mg/g, the 2-year risk is already at least ${twoYearText}% and above 40%. Obtain quantitative UACR promptly and assess KRT preparation with the clinical context.`,
            )
          : exceedsMultidisciplinaryCare
            ? text(
                locale,
                `以半定量 UACR 下限 ${semiquantitativeLowerBound} mg/g 計算時，2 年風險已至少 ${twoYearText}% 並超過 10%；應取得定量 UACR，並評估多專業腎臟照護。`,
                `Using the semiquantitative UACR lower bound of ${semiquantitativeLowerBound} mg/g, the 2-year risk is already at least ${twoYearText}% and above 10%. Obtain quantitative UACR and assess multidisciplinary kidney care.`,
              )
            : reachesReferralRange
              ? text(
                  locale,
                  `以半定量 UACR 下限 ${semiquantitativeLowerBound} mg/g 計算時，5 年風險已至少 ${fiveYearText}% 並達轉介決策區間；應取得定量 UACR，並與其他條件共同評估腎臟專科轉介。`,
                  `Using the semiquantitative UACR lower bound of ${semiquantitativeLowerBound} mg/g, the 5-year risk is already at least ${fiveYearText}% and reaches the referral decision range. Obtain quantitative UACR and assess nephrology referral with other criteria.`,
                )
              : text(
                  locale,
                  `以半定量 UACR 下限 ${semiquantitativeLowerBound} mg/g 計算的風險下限尚未達 KDIGO 決策閾值，但不能排除實際 UACR 更高後跨越閾值；仍需取得定量 UACR。`,
                  `The risk floor calculated from the semiquantitative UACR lower bound of ${semiquantitativeLowerBound} mg/g is below KDIGO decision thresholds, but a higher actual UACR could cross them. Quantitative UACR is still required.`,
                )
      )
    : !risk
    ? text(
        locale,
        '先補齊 KFRE 必要輸入，再使用適用台灣的非北美校正版計算；只有明確提供數值下限的半定量 UACR 才能顯示保守下限情境。',
        'Complete the required KFRE inputs, then calculate with the non–North American calibration applicable to Taiwan. A conservative lower-bound scenario is shown only when the semiquantitative UACR explicitly provides a numeric lower bound.',
      )
    : exceedsKrtPreparation
      ? text(
          locale,
          `2 年風險 ${twoYearText}% 已超過 40%；可合併 eGFR、UACR、臨床情境與病人目標，評估腎臟替代治療衛教、血管通路或移植轉介準備。`,
          `The 2-year risk is ${twoYearText}%, above 40%. Combine it with eGFR, UACR, clinical context, and patient goals to consider KRT education, access planning, or transplant referral.`,
        )
      : exceedsMultidisciplinaryCare
        ? text(
            locale,
            `2 年風險 ${twoYearText}% 已超過 10%；可合併 eGFR、UACR 與臨床情境，評估啟動多專業腎臟照護。`,
            `The 2-year risk is ${twoYearText}%, above 10%. Combine it with eGFR, UACR, and clinical context to consider multidisciplinary kidney care.`,
          )
        : reachesReferralRange
          ? text(
              locale,
              `5 年風險 ${fiveYearText}% 已達 3%–5% 轉介決策區間；可與其他轉介條件及院內流程共同評估腎臟專科轉介。`,
              `The 5-year risk is ${fiveYearText}%, reaching the 3%–5% referral decision range. Assess nephrology referral alongside other criteria and local pathways.`,
            )
          : text(
              locale,
              `目前 2 年／5 年 KFRE 低於 KDIGO 的風險決策閾值；仍須依 eGFR、UACR、病因、腎功能趨勢與其他轉介條件追蹤。`,
              `The current 2- and 5-year KFRE estimates are below KDIGO risk thresholds; continue to use eGFR, UACR, cause, kidney-function trajectory, and other referral criteria.`,
            )

  return {
    id: 'ckd-kidney-failure-risk',
    domain: 'monitoring',
    priority,
    status,
    overviewEvidenceFactKey: quantitativeUacr === undefined || isLowerBoundScenario
      ? 'urineAlbuminOverview'
      : sex === undefined
        ? 'sex'
        : 'eGFR',
    title: riskTitle
      ?? (
        quantitativeUacr === undefined || quantitativeUacr <= 0
          ? text(
              locale,
              `KFRE｜${gStage}：缺少定量 UACR 或數值無法使用`,
              `KFRE | ${gStage}: quantitative UACR is missing or unusable`,
            )
          : sex === undefined
            ? text(
                locale,
                `KFRE｜${gStage}：缺少公式所需性別`,
                `KFRE | ${gStage}: the sex input required by the equation is missing`,
              )
            : text(
                locale,
                `KFRE｜${gStage}：必要輸入不完整`,
                `KFRE | ${gStage}: required inputs are incomplete`,
              )
      ),
    recommendation,
    rationale: text(
      locale,
      isLowerBoundScenario
        ? '本卡直接使用醫療計算機共用的 4 變數 KFRE 核心；半定量 UACR 僅以明確數值下限建立方向性的保守情境，不視為正式 KFRE 預估。'
        : '本卡直接使用醫療計算機共用的 4 變數 KFRE 核心，以年齡、性別、eGFR 與定量 UACR 估算 2 年與 5 年內需透析或腎臟移植的絕對風險。',
      isLowerBoundScenario
        ? 'This card directly uses the same shared 4-variable KFRE engine as the medical calculator. A semiquantitative UACR is used only as an explicit numeric lower bound for a directional conservative scenario, not as a formal KFRE estimate.'
        : 'This card directly uses the same shared 4-variable KFRE engine as the medical calculator, using age, sex, eGFR, and quantitative UACR to estimate absolute 2- and 5-year risk of dialysis or kidney transplant.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'age', '年齡', 'Age'),
      patientEvidence(profile, locale, 'sex', '性別', 'Sex'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'urineAlbuminOverview', '尿白蛋白', 'Urine albumin'),
    ]),
    missingData: risk && !isLowerBoundScenario
      ? []
      : [
          ...(age === undefined
            ? [text(locale, '年齡', 'Age')]
            : []),
          ...(sex === undefined
            ? [text(locale, 'FHIR Patient 中的男性／女性性別', 'Male/female sex from FHIR Patient')]
            : []),
          ...(eGfr === undefined
            ? [text(locale, 'eGFR', 'eGFR')]
            : []),
          ...(isLowerBoundScenario
            ? [text(
                locale,
                `定量 UACR（mg/g）；目前僅有半定量下限 ${semiquantitativeLowerBound} mg/g`,
                `Quantitative UACR (mg/g); only a semiquantitative lower bound of ${semiquantitativeLowerBound} mg/g is currently available`,
              )]
            : quantitativeUacr === undefined || quantitativeUacr <= 0
            ? [text(locale, '大於 0 的定量 UACR（mg/g）', 'Quantitative UACR above 0 mg/g')]
            : []),
        ],
    nextActions: [text(
      locale,
      risk && isLowerBoundScenario
        ? '安排定量 UACR；取得結果後以相同 KFRE 核心重新計算並取代本下限情境。'
        : risk
        ? '核對 eGFR 與定量 UACR 的日期、單位及穩定性，將 2 年／5 年風險與院內照護流程一併記錄。'
        : '查找或補做必要輸入；資料完整且腎功能穩定後再計算。',
      risk && isLowerBoundScenario
        ? 'Obtain quantitative UACR, then recalculate with the same KFRE engine and replace this lower-bound scenario.'
        : risk
        ? 'Verify the dates, units, and stability of eGFR and quantitative UACR, then document the 2- and 5-year risks with the local care pathway.'
        : 'Retrieve or obtain the required inputs and calculate only when data are complete and kidney function is stable.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      isLowerBoundScenario
        ? `半定量 UACR >${semiquantitativeLowerBound} mg/g 代入 ${semiquantitativeLowerBound} 只能得到風險下限，不是正式 KFRE；不得用「低於閾值」排除較高真實風險，仍須以定量 UACR 重算。`
        : '使用 Tangri 4 變數 KFRE 與已發表的非北美區域校正；僅在成人 CKD G3-G5、eGFR 穩定且定量 UACR 完整時顯示。IgA 腎病或 ADPKD 應評估疾病專屬模型。',
      isLowerBoundScenario
        ? `Entering ${semiquantitativeLowerBound} for semiquantitative UACR >${semiquantitativeLowerBound} mg/g yields only a risk floor, not a formal KFRE estimate. A value below a threshold cannot exclude higher true risk; recalculate with quantitative UACR.`
        : 'Uses the Tangri 4-variable KFRE with the published non–North American calibration and displays a result only for adults with stable CKD G3-G5 and complete quantitative UACR. Consider disease-specific models for IgA nephropathy or ADPKD.',
    ),
  }
}

function buildBloodPressureVolume(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const bp = bloodPressureValues(profile)
  const current = profile.freshnessContexts?.bloodPressure?.state === 'current'
  const usableBp = current ? bp : undefined
  const age = numberFromFact(profile, 'age')
  const geriatric = profile.olderAdultContext
  const needsIndividualTarget = (
    (age !== undefined && age >= 90)
    || geriatric?.frailtyStatus === 'frail'
    || geriatric?.healthStatus === 'very-complex-poor-health'
  )
  const aboveIntensiveTarget = usableBp !== undefined && usableBp.systolic >= 120
  const status: CdssRecommendation['status'] = !usableBp
    ? 'needs-data'
    : aboveIntensiveTarget
      ? 'review'
      : 'no-action'

  return {
    id: 'ckd-blood-pressure-volume',
    domain: 'target',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: 'bloodPressure',
    title: !usableBp
      ? text(locale, '缺少近期可判讀的血壓與體液狀態', 'Recent interpretable blood pressure and volume status are missing')
      : aboveIntensiveTarget
        ? text(
            locale,
            `血壓 ${usableBp.systolic}/${usableBp.diastolic} mmHg：先確認量測方式與個人化目標`,
            `Blood pressure ${usableBp.systolic}/${usableBp.diastolic} mmHg: verify measurement method and individualized target`,
          )
        : text(
            locale,
            `近期血壓 ${usableBp.systolic}/${usableBp.diastolic} mmHg，未觸發本版血壓目標提示`,
            `Recent blood pressure is ${usableBp.systolic}/${usableBp.diastolic} mmHg; no target prompt is triggered`,
          ),
    recommendation: text(
      locale,
      needsIndividualTarget
        ? '先確認標準化診間血壓、姿勢性症狀、跌倒風險與體液狀態；此病人屬高齡／脆弱情境，不直接套用 SBP <120 mmHg，應依耐受性與照護目標個人化。'
        : '若為高血壓且使用標準化診間量測，可將可耐受的 SBP <120 mmHg 作為討論目標；同時核對姿勢性症狀、體液狀態與藥物。',
      needsIndividualTarget
        ? 'Verify standardized office blood pressure, orthostatic symptoms, fall risk, and volume status. In this older/vulnerable context, do not apply SBP below 120 mm Hg automatically; individualize to tolerance and goals of care.'
        : 'For high blood pressure measured with a standardized office method, SBP below 120 mm Hg when tolerated can be discussed while reviewing orthostatic symptoms, volume status, and medications.',
    ),
    rationale: text(
      locale,
      'KDIGO 的 <120 mmHg 建議以標準化診間量測與可耐受為前提；衰弱、跌倒風險、有限預期壽命或症狀性姿勢性低血壓應採較寬鬆策略。',
      'The KDIGO target below 120 mm Hg assumes standardized office measurement and tolerance; frailty, fall risk, limited life expectancy, or symptomatic orthostasis support a less intensive approach.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'bloodPressure', '近期血壓', 'Recent blood pressure'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
    ]),
    missingData: [
      ...(!usableBp
        ? [text(locale, '標準化診間血壓與量測日期', 'Standardized office blood pressure and measurement date')]
        : []),
      ...(status !== 'no-action'
        ? [text(locale, '姿勢性症狀、跌倒風險與體液狀態', 'Orthostatic symptoms, fall risk, and volume status')]
        : []),
    ],
    nextActions: [text(
      locale,
      '先查完整病歷；必要時以正確袖帶與標準化流程重測，脆弱或有症狀者加做坐／站立血壓。',
      'Review the complete chart and repeat using the correct cuff and standardized technique when needed; add seated/standing measurements for vulnerable or symptomatic patients.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '非標準化血壓不可直接套用 <120 mmHg；本模組不依單次血壓自動調藥。',
      'Do not apply the below-120 target to nonstandardized measurements; this module never adjusts treatment automatically from one blood pressure.',
    ),
  }
}

function buildRasStrategy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const uacr = quantitativeUacrFromProfile(profile)
  const aStage = classifyUacr(uacr)
  const state = medicationClassState(profile, 'ace-inhibitor-or-arb')
  const context = profile.medicationClassContexts?.['ace-inhibitor-or-arb']
  const indicated = aStage === 'A2' || aStage === 'A3'
  const reconciled = state === 'confirmed-current'
  const status: CdssRecommendation['status'] = uacr === undefined
    ? 'needs-data'
    : indicated && !reconciled
      ? 'review'
      : 'no-action'
  const historyDetail = context?.lastPrescriptionDate
    ? text(
        locale,
        `；最後處方 ${context.lastPrescriptionDate}`,
        `; last prescription ${context.lastPrescriptionDate}`,
      )
    : ''

  return {
    id: 'ckd-rasi-strategy',
    domain: 'medication',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: 'aceArbTherapy',
    title: state === 'historical-record-current-status-unknown'
      ? text(
          locale,
          `有 ACEI／ARB 歷史處方，近期是否持續未知${historyDetail}`,
          `A historical ACE inhibitor/ARB record exists; current use is unknown${historyDetail}`,
        )
      : state === 'active-order-unconfirmed'
        ? text(locale, '有 ACEI／ARB 近期處方，實際使用待核對', 'A recent ACE inhibitor/ARB order exists; actual use needs reconciliation')
        : indicated && state === 'not-found'
          ? text(locale, `${aStage} 白蛋白尿：評估 ACEI／ARB 適用性`, `${aStage} albuminuria: assess ACE inhibitor/ARB suitability`)
          : uacr === undefined
            ? text(locale, '缺少定量 UACR，ACEI／ARB 適用條件未完整', 'Quantitative UACR is missing, so ACE inhibitor/ARB criteria are incomplete')
            : text(locale, 'ACEI／ARB 類別已完成自動核對', 'ACE inhibitor/ARB class checked'),
    recommendation: text(
      locale,
      indicated
        ? '依白蛋白尿、糖尿病、血壓、血鉀、creatinine、過敏／不耐受與實際用藥狀態評估 ACEI 或 ARB；先核對歷史處方與停藥原因，不把資料缺漏當成未使用。'
        : '目前定量 UACR 未觸發本版的白蛋白尿 RASi 提示；仍依高血壓、心衰竭等其他適應症與完整病歷評估。',
      indicated
        ? 'Assess an ACE inhibitor or ARB using albuminuria, diabetes, blood pressure, potassium, creatinine, allergy/intolerance, and actual use. Reconcile historical prescriptions and reasons for stopping rather than treating missing data as nonuse.'
        : 'Current quantitative UACR does not trigger the albuminuria RASi prompt in this version; assess other indications such as hypertension or heart failure using the complete chart.',
    ),
    rationale: text(
      locale,
      'KDIGO 依糖尿病與 A2/A3 白蛋白尿建議 RAS 抑制劑，且治療後的腎功能與血鉀變化需有時間關係。',
      'KDIGO recommends RAS inhibition according to diabetes and A2/A3 albuminuria, with kidney function and potassium interpreted in relation to treatment timing.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'urineAlbuminOverview', '尿白蛋白', 'Urine albumin'),
      patientEvidence(profile, locale, 'aceArbTherapy', 'ACEI／ARB', 'ACE inhibitor/ARB'),
      patientEvidence(profile, locale, 'bloodPressure', '近期血壓', 'Recent blood pressure'),
      patientEvidence(profile, locale, 'serumCreatinine', 'Creatinine', 'Creatinine'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
    ]),
    missingData: [
      ...(uacr === undefined
        ? [text(locale, '定量 UACR（mg/g）', 'Quantitative UACR (mg/g)')]
        : []),
      ...(indicated && !reconciled
        ? [text(locale, '目前實際使用、既往耐受性與停藥原因', 'Actual current use, prior tolerance, and reason for stopping')]
        : []),
      ...(indicated && !profile.facts.bloodPressure
        ? [text(locale, '近期血壓', 'Recent blood pressure')]
        : []),
      ...(indicated && !profile.facts.potassium
        ? [text(locale, '血鉀', 'Potassium')]
        : []),
      ...(indicated && !profile.facts.serumCreatinine
        ? [text(locale, 'Creatinine', 'Creatinine')]
        : []),
    ],
    nextActions: [text(
      locale,
      '若開始、重新開始或增加劑量，2–4 週檢查血壓、creatinine 與血鉀；4 週內 creatinine 上升 >30% 才觸發原因評估，eGFR 低於 30 本身不是停藥理由。',
      'If started, restarted, or titrated, check blood pressure, creatinine, and potassium in 2–4 weeks. A creatinine rise over 30% within 4 weeks triggers evaluation; eGFR below 30 alone is not a reason to stop.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '這是適用性與用藥核對，不是自動開藥、增量或停藥指示；避免 ACEI、ARB 與直接腎素抑制劑合併。',
      'This is a suitability and medication-reconciliation prompt, not an automatic start, titration, or stop instruction; avoid combining ACE inhibitors, ARBs, and direct renin inhibitors.',
    ),
  }
}

function buildSglt2Strategy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const eGfr = numberFromFact(profile, 'eGFR')
  const uacr = quantitativeUacrFromProfile(profile)
  const heartFailure = Boolean(profile.facts.heartFailureDiagnosis)
  const state = medicationClassState(profile, 'sglt2-inhibitor')
  const current = state === 'confirmed-current'
  const needsReconciliation = (
    state === 'active-order-unconfirmed'
    || state === 'on-hold'
    || state === 'historical-record-current-status-unknown'
    || state === 'uncertain'
  )
  const candidate = (
    eGfr !== undefined
    && eGfr >= 20
    && (
      heartFailure
      || (uacr !== undefined && uacr >= 200)
      || eGfr <= 45
    )
  )
  const needsUacr = eGfr !== undefined && eGfr > 45 && !heartFailure && uacr === undefined
  const status: CdssRecommendation['status'] = current
    ? 'no-action'
    : needsReconciliation || (candidate && state === 'not-found')
      ? 'review'
      : eGfr === undefined || needsUacr
        ? 'needs-data'
        : 'no-action'

  return {
    id: 'ckd-sglt2-strategy',
    domain: 'medication',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: 'sglt2Therapy',
    title: needsReconciliation
      ? text(locale, '核對 SGLT2 抑制劑實際使用與心腎適應症', 'Reconcile actual SGLT2 inhibitor use and cardiorenal indication')
      : candidate && state === 'not-found'
        ? text(locale, '依 eGFR、UACR／心衰竭條件評估 SGLT2 抑制劑', 'Evaluate an SGLT2 inhibitor using eGFR and UACR/heart-failure criteria')
        : current
          ? text(locale, 'SGLT2 抑制劑目前使用紀錄已確認', 'Current SGLT2 inhibitor use is confirmed')
          : eGfr === undefined || needsUacr
            ? text(locale, 'SGLT2 抑制劑適用性仍缺必要腎臟資料', 'Required kidney data are missing for SGLT2 inhibitor assessment')
            : text(locale, '目前未觸發本版 SGLT2 抑制劑提示', 'No SGLT2 inhibitor prompt is triggered in this version'),
    recommendation: text(
      locale,
      current
        ? '若確認正在使用且耐受，因 CKD／心衰竭的心腎適應症繼續使用，不因 HbA1c 偏低而單獨停藥；同步核對急性病況與體液狀態。'
        : '以 eGFR、定量 UACR、心衰竭、實際用藥、耐受性與近期急性病況共同評估；有處方不等同已服用，缺少處方也不等同從未使用。',
      current
        ? 'If current use and tolerance are confirmed, continue for CKD/heart-failure cardiorenal benefit and do not stop solely because A1c is low; also review acute illness and volume status.'
        : 'Assess using eGFR, quantitative UACR, heart failure, actual use, tolerance, and recent acute illness. An order does not prove use, and absence of an order does not prove never-use.',
    ),
    rationale: text(
      locale,
      'KDIGO 建議 eGFR ≥20 且 UACR ≥200 mg/g 或合併心衰竭者使用；eGFR 20–45 且 UACR <200 mg/g 亦可評估。',
      'KDIGO recommends treatment at eGFR at least 20 with UACR at least 200 mg/g or heart failure, and suggests consideration at eGFR 20–45 with UACR below 200 mg/g.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'urineAlbuminOverview', '尿白蛋白', 'Urine albumin'),
      patientEvidence(profile, locale, 'heartFailureDiagnosis', '心衰竭', 'Heart failure'),
      patientEvidence(profile, locale, 'sglt2Therapy', 'SGLT2 抑制劑', 'SGLT2 inhibitor'),
    ]),
    missingData: [
      ...(eGfr === undefined ? [text(locale, 'eGFR', 'eGFR')] : []),
      ...(needsUacr ? [text(locale, '定量 UACR（mg/g）', 'Quantitative UACR (mg/g)')] : []),
      ...(needsReconciliation
        ? [text(locale, '實際服用、耐受性、近期急性病況與體液狀態', 'Actual use, tolerance, recent acute illness, and volume status')]
        : []),
    ],
    nextActions: [text(
      locale,
      'dapagliflozin 在重大手術或長時間禁食前至少停 3 天，恢復進食且臨床穩定後再恢復；不要把顯影劑檢查一律設為停藥。',
      'Hold dapagliflozin for at least 3 days before major surgery or prolonged fasting and resume after eating and clinical stability return; do not apply a universal contrast-related hold.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組不自動開停藥，也不取代酮酸中毒、急性病、體液不足與手術禁食風險評估。',
      'This module never starts or stops therapy automatically and does not replace assessment of ketoacidosis, acute illness, volume depletion, or perioperative fasting risk.',
    ),
  }
}

function buildFinerenoneStrategy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  if (profile.eligibleDiseasePackIds?.includes('dm-poc') !== true) return undefined
  const eGfr = numberFromFact(profile, 'eGFR')
  const uacr = quantitativeUacrFromProfile(profile)
  const potassium = numberFromFact(profile, 'potassium')
  const rasState = medicationClassState(profile, 'ace-inhibitor-or-arb')
  const state = medicationClassState(profile, 'finerenone')
  const qualifyingReadings = (profile.observationContexts?.uacr?.readings ?? [])
    .filter((reading) => (
      reading.kind === 'quantitative'
      && reading.numericValueMgG !== undefined
      && reading.numericValueMgG > 30
      && Boolean(reading.date)
    ))
  const persistentAlbuminuria = new Set(qualifyingReadings.map((reading) => reading.date)).size >= 2
  const candidate = eGfr !== undefined && eGfr > 25 && uacr !== undefined && uacr > 30
  const potassiumBlocksInitiation = potassium !== undefined && potassium > 5
  const potassiumNeedsJudgment = potassium !== undefined && potassium >= 4.8 && potassium <= 5
  const stateNeedsReview = state !== 'not-found'
  const prerequisitesComplete = (
    candidate
    && persistentAlbuminuria
    && rasState === 'confirmed-current'
    && potassium !== undefined
    && potassium <= 5
  )
  const status: CdssRecommendation['status'] = stateNeedsReview || potassiumBlocksInitiation
    ? 'review'
    : eGfr === undefined || uacr === undefined || potassium === undefined
      ? 'needs-data'
      : candidate && !prerequisitesComplete
        ? 'needs-data'
        : candidate
          ? 'review'
          : 'no-action'

  return {
    id: 'ckd-finerenone-strategy',
    domain: 'medication',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: 'finerenoneTherapy',
    title: potassiumBlocksInitiation
      ? text(locale, `血鉀 ${potassium} mmol/L：不應開始 finerenone`, `Potassium ${potassium} mmol/L: do not initiate finerenone`)
      : stateNeedsReview
        ? text(locale, '已有 finerenone 紀錄，核對實際使用與血鉀監測', 'A finerenone record exists; reconcile actual use and potassium monitoring')
        : candidate && prerequisitesComplete
          ? text(locale, '糖尿病 CKD：可進一步評估 finerenone', 'Diabetic CKD: finerenone can be assessed further')
          : candidate
            ? text(locale, 'Finerenone 前置條件尚未完整', 'Finerenone prerequisites are incomplete')
            : status === 'needs-data'
              ? text(locale, 'Finerenone 適用性仍缺必要資料', 'Required data are missing for finerenone assessment')
              : text(locale, '目前未觸發本版 finerenone 提示', 'No finerenone prompt is triggered in this version'),
    recommendation: text(
      locale,
      potassiumNeedsJudgment
        ? `目前血鉀 ${potassium} mmol/L 落在 4.8–5.0；只有在確認持續 UACR >30 mg/g、eGFR >25、最大耐受 RASi，並能加密監測時才依臨床判斷評估。`
        : 'Finerenone 僅作階段式提示：先確認持續 UACR >30 mg/g、eGFR >25、正常血鉀及最大耐受 RASi，再依效益、風險與病人目標評估。',
      potassiumNeedsJudgment
        ? `Potassium ${potassium} mmol/L is in the 4.8–5.0 range. Consider only with clinical judgment after confirming persistent UACR above 30 mg/g, eGFR above 25, maximally tolerated RASi, and capacity for closer monitoring.`
        : 'Finerenone is presented only as a staged prompt: first confirm persistent UACR above 30 mg/g, eGFR above 25, normal potassium, and maximally tolerated RASi, then assess benefit, risk, and patient goals.',
    ),
    rationale: text(
      locale,
      'KDIGO 將非類固醇 MRA 定位於 T2D、持續白蛋白尿且已接受最大耐受 RASi 的高風險 CKD。',
      'KDIGO positions a nonsteroidal MRA for high-risk CKD with T2D, persistent albuminuria, and maximally tolerated RAS inhibition.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'urineAlbuminOverview', '尿白蛋白', 'Urine albumin'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      patientEvidence(profile, locale, 'aceArbTherapy', 'ACEI／ARB', 'ACE inhibitor/ARB'),
      patientEvidence(profile, locale, 'finerenoneTherapy', 'Finerenone', 'Finerenone'),
    ]),
    missingData: [
      ...(eGfr === undefined ? [text(locale, 'eGFR', 'eGFR')] : []),
      ...(uacr === undefined ? [text(locale, '定量 UACR（mg/g）', 'Quantitative UACR (mg/g)')] : []),
      ...(candidate && !persistentAlbuminuria
        ? [text(locale, '持續 UACR >30 mg/g 的重複定量紀錄', 'Repeat quantitative results confirming persistent UACR above 30 mg/g')]
        : []),
      ...(candidate && rasState !== 'confirmed-current'
        ? [text(locale, '最大耐受 RASi 持續使用與耐受紀錄', 'Documented continued maximally tolerated RASi use and tolerance')]
        : []),
      ...(potassium === undefined ? [text(locale, '近期血鉀', 'Recent potassium')] : []),
    ],
    nextActions: [text(
      locale,
      '若經臨床決策開始，4 週複查血鉀與腎功能；K >5.0 mmol/L 不應開始，4.8–5.0 mmol/L 需依臨床判斷並加密監測。',
      'If initiated after clinical review, recheck potassium and kidney function at 4 weeks. Do not initiate above 5.0 mmol/L; 4.8–5.0 mmol/L requires clinical judgment and closer monitoring.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組不由單次 UACR 或血鉀自動開藥；需先排除高血鉀、低血壓、急性病況及其他禁忌。',
      'This module never initiates treatment from a single UACR or potassium result; hyperkalemia, hypotension, acute illness, and other contraindications must be reviewed first.',
    ),
  }
}

function buildCardiovascularRisk(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const age = numberFromFact(profile, 'age')
  const state = medicationClassState(profile, 'statin')
  const context = profile.medicationClassContexts?.statin
  const hasDiabetes = profile.eligibleDiseasePackIds?.includes('dm-poc') === true
  const hasAscvd = Boolean(profile.facts.ascvdDiagnosis)
  const shouldReview = (age !== undefined && age >= 50) || hasDiabetes || hasAscvd
  const vulnerable = (
    (age !== undefined && age >= 90)
    || profile.olderAdultContext?.frailtyStatus === 'frail'
    || profile.olderAdultContext?.healthStatus === 'very-complex-poor-health'
  )
  const status: CdssRecommendation['status'] = age === undefined
    ? 'needs-data'
    : shouldReview && state !== 'confirmed-current'
      ? 'review'
      : 'no-action'

  return {
    id: 'ckd-cardiovascular-risk',
    domain: 'medication',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: 'statinTherapy',
    title: state === 'historical-record-current-status-unknown'
      ? text(
          locale,
          `有 statin 歷史處方，近期是否持續未知${context?.lastPrescriptionDate ? `；最後處方 ${context.lastPrescriptionDate}` : ''}`,
          `A historical statin record exists; current use is unknown${context?.lastPrescriptionDate ? `; last prescription ${context.lastPrescriptionDate}` : ''}`,
        )
      : shouldReview && state === 'not-found'
        ? text(locale, 'CKD 心血管風險：核對 statin 適用性與目前用藥', 'CKD cardiovascular risk: reconcile statin suitability and current use')
        : state === 'active-order-unconfirmed'
          ? text(locale, '有 statin 近期處方，實際使用待核對', 'A recent statin order exists; actual use needs reconciliation')
          : text(locale, 'CKD 心血管風險藥物已完成自動核對', 'CKD cardiovascular-risk medication checked'),
    recommendation: text(
      locale,
      vulnerable
        ? '先確認是否仍使用及既往耐受性，再以預期效益時間、交互作用、衰弱程度與照護目標決定最大耐受強度；不要直接提示開始高強度 statin。'
        : '依年齡、CKD 分期、ASCVD／糖尿病、目前用藥與耐受性評估 statin 或 statin/ezetimibe；先核對完整用藥，不把資料缺漏當成未使用。',
      vulnerable
        ? 'First confirm current use and prior tolerance, then use time to benefit, interactions, frailty, and goals of care to determine maximally tolerated intensity; do not directly prompt high-intensity statin initiation.'
        : 'Assess a statin or statin/ezetimibe using age, CKD stage, ASCVD/diabetes, current medication use, and tolerance. Reconcile the full medication history rather than treating missing data as nonuse.',
    ),
    rationale: text(
      locale,
      'KDIGO 對成人 CKD 的 statin 建議以年齡與風險分層；高齡或衰弱者仍需整合可耐受性、交互作用與病人目標。',
      'KDIGO stratifies statin guidance in adult CKD by age and risk; older or frail adults still require integration of tolerance, interactions, and patient goals.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'age', '年齡', 'Age'),
      patientEvidence(profile, locale, 'ckdDiagnosis', 'CKD 診斷', 'CKD diagnosis'),
      patientEvidence(profile, locale, 'ascvdDiagnosis', 'ASCVD', 'ASCVD'),
      patientEvidence(profile, locale, 'LDL', 'LDL-C', 'LDL-C'),
      patientEvidence(profile, locale, 'statinTherapy', 'Statin', 'Statin'),
    ]),
    missingData: status === 'review'
      ? [
          text(locale, '目前實際用藥、既往耐受性與停藥原因', 'Actual current use, prior tolerance, and reason for stopping'),
          text(locale, '慢性透析／腎移植狀態與照護目標', 'Chronic dialysis/transplant status and goals of care'),
        ]
      : [],
    nextActions: [text(
      locale,
      '查找完整處方、藥物不良反應與交互作用；依預期效益時間與病人偏好決定是否續用及強度。',
      'Review the complete prescription history, adverse effects, and interactions, then decide continuation and intensity using time to benefit and patient preferences.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組不由 LDL 單一數值或 CKD 診斷自動指定成分與強度。',
      'This module does not select an agent or intensity automatically from a single LDL value or CKD diagnosis.',
    ),
  }
}

function buildMedicationSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const medicationOverview = profile.facts.medicationListOverview
  const currentNsaid = profile.facts.currentNsaid
  const status: CdssRecommendation['status'] = currentNsaid
    ? 'review'
    : medicationOverview
      ? 'no-action'
      : 'needs-data'

  return {
    id: 'ckd-medication-safety',
    domain: 'safety',
    priority: currentNsaid ? 'high' : status === 'needs-data' ? 'medium' : 'routine',
    status,
    overviewEvidenceFactKey: currentNsaid ? 'currentNsaid' : 'medicationListOverview',
    title: currentNsaid
      ? text(locale, '辨識到可能的 NSAID，需核對適應症與腎臟風險', 'A potential NSAID was identified; review indication and kidney risk')
      : medicationOverview
        ? text(locale, '目前用藥已完成常見 NSAID 自動掃描', 'Current medication data screened for common NSAIDs')
        : text(locale, '缺少可核對的目前用藥清單', 'A current medication list is unavailable for review'),
    recommendation: text(
      locale,
      currentNsaid
        ? '確認是否實際使用、劑量、期間與替代方案；同時依 eGFR 檢查腎排除藥物劑量、窄治療窗藥物及電解質監測。'
        : '核對處方藥、成藥、止痛藥、中草藥與保健品；依 eGFR 檢查腎排除藥物劑量、潛在腎毒性、交互作用與監測需求。',
      currentNsaid
        ? 'Confirm actual use, dose, duration, and alternatives; also review kidney-cleared dosing, narrow-therapeutic-index medicines, and electrolyte monitoring according to eGFR.'
        : 'Reconcile prescriptions, OTC products, analgesics, herbal remedies, and supplements; review kidney-cleared dosing, potential nephrotoxicity, interactions, and monitoring according to eGFR.',
    ),
    rationale: text(
      locale,
      'CKD 會改變藥物清除與不良反應風險；KDIGO 建議腎毒性、窄治療窗藥物及成藥／草藥納入藥物治理。',
      'CKD changes drug clearance and adverse-effect risk; KDIGO recommends stewardship for nephrotoxins, narrow-therapeutic-index medicines, and OTC/herbal products.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'medicationListOverview', '目前用藥資料', 'Current medication data'),
      patientEvidence(profile, locale, 'currentNsaid', '可能的 NSAID', 'Potential NSAID'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
    ]),
    missingData: medicationOverview
      ? [text(locale, '成藥、中草藥、保健品與院外用藥', 'OTC, herbal, supplement, and outside-facility medicines')]
      : [text(locale, '完整目前用藥清單（含成藥、中草藥與保健品）', 'Complete current medication list, including OTC, herbal, and supplements')],
    nextActions: [text(
      locale,
      '先做藥物整合；有疑義時由藥師／臨床團隊逐項核對適應症、腎功能劑量與監測。',
      'Reconcile medications first, then have the pharmacist/clinical team review indication, kidney-function dosing, and monitoring item by item when needed.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '自動掃描僅辨識常見名稱，未辨識到不代表沒有腎毒性藥物，也不應自行停用必要治療。',
      'The automated scan recognizes only common names; no match does not prove absence of nephrotoxins and is not a reason to stop necessary treatment.',
    ),
  }
}

function buildAnemiaMonitoring(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const stage = stageFromProfile(profile)
  const sex = profile.demographics?.sex
  const hemoglobin = numberFromFact(profile, 'hemoglobin')
  const anemiaThreshold = sex === 'male' ? 13 : sex === 'female' ? 12 : undefined
  const hasAnemia = (
    hemoglobin !== undefined
    && anemiaThreshold !== undefined
    && hemoglobin < anemiaThreshold
  )
  const status: CdssRecommendation['status'] = hasAnemia
    ? 'review'
    : hemoglobin !== undefined && anemiaThreshold === undefined
      ? 'needs-data'
      : hemoglobin === undefined && isAdvancedCkd(stage)
        ? 'needs-data'
        : 'no-action'

  return {
    id: 'ckd-anemia-monitoring',
    domain: 'complication',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: profile.facts.hemoglobin ? 'hemoglobin' : 'eGFR',
    title: hasAnemia
      ? text(
          locale,
          `Hb ${hemoglobin} g/dL：${sex === 'male' ? '男性' : '女性'}貧血，先評估原因與趨勢`,
          `Hemoglobin ${hemoglobin} g/dL: anemia for ${sex === 'male' ? 'a male' : 'a female'} patient; evaluate cause and trend`,
        )
      : status === 'needs-data'
        ? text(locale, `${stage ?? 'CKD'}：貧血評估資料尚未完整`, `${stage ?? 'CKD'}: anemia assessment data are incomplete`)
        : text(locale, '目前未觸發 CKD 貧血提示', 'No CKD anemia prompt is triggered'),
    recommendation: text(
      locale,
      hasAnemia
        ? `依性別門檻，Hb ${hemoglobin} g/dL 屬貧血。先看 CBC 連續趨勢、網狀紅血球、ferritin 與 TSAT，並評估出血、營養缺乏、發炎及其他原因；單一輕度貧血不直接觸發 ESA。`
        : '依 CKD 分期與症狀核對 Hb；若異常，先完成貧血原因與鐵狀態評估。',
      hasAnemia
        ? `Using the sex-specific threshold, hemoglobin ${hemoglobin} g/dL meets anemia criteria. Review the CBC trend, reticulocyte count, ferritin, and TSAT and assess bleeding, nutritional deficiency, inflammation, and other causes; a single mild value does not trigger ESA therapy.`
        : 'Review hemoglobin according to CKD stage and symptoms; if abnormal, first evaluate anemia causes and iron status.',
    ),
    rationale: text(
      locale,
      'CKD 進展時貧血風險增加，但治療需建立在趨勢、症狀、鐵狀態與其他病因評估。',
      'Anemia risk rises as CKD advances, but management depends on trends, symptoms, iron status, and assessment of other causes.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'hemoglobin', '血紅素', 'Hemoglobin'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'albumin', '白蛋白', 'Albumin'),
    ]),
    missingData: [
      ...(hemoglobin === undefined && isAdvancedCkd(stage)
        ? [text(locale, '血紅素', 'Hemoglobin')]
        : []),
      ...(hemoglobin !== undefined && anemiaThreshold === undefined
        ? [text(locale, '公式所需性別', 'Sex needed for interpretation')]
        : []),
      ...(hasAnemia
        ? [
            text(locale, 'CBC 連續趨勢與網狀紅血球', 'CBC trend and reticulocyte count'),
            text(locale, 'ferritin 與 TSAT', 'Ferritin and TSAT'),
          ]
        : []),
    ],
    nextActions: [text(
      locale,
      hasAnemia
        ? '查找 CBC trend、reticulocyte、ferritin 與 TSAT；依完整評估結果決定後續，不由單一輕度 Hb 直接提示 ESA。'
        : '先查完整病歷；依分期、症狀與採檢日期決定是否需要更新。',
      hasAnemia
        ? 'Retrieve CBC trend, reticulocyte count, ferritin, and TSAT; base next steps on the complete evaluation rather than prompting ESA from one mild hemoglobin result.'
        : 'Review the complete chart and decide whether an update is needed using stage, symptoms, and collection date.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本卡未啟用 KDIGO 2026 貧血來源；缺少資料不等於已有貧血，單一輕度異常不直接觸發 ESA。',
      'The KDIGO 2026 anemia source is not enabled for this card; missing data do not establish anemia, and one mild abnormal result does not trigger ESA therapy.',
    ),
  }
}

function buildPotassiumAcidosis(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const stage = stageFromProfile(profile)
  const potassium = numberFromFact(profile, 'potassium')
  const bicarbonate = numberFromFact(profile, 'bicarbonate')
  const potassiumAbnormal = potassium !== undefined && (potassium < 3.5 || potassium > 5.5)
  const importantAcidosis = bicarbonate !== undefined && bicarbonate < 18
  const missing = isAdvancedCkd(stage)
    ? [
        ...(!profile.facts.potassium ? [text(locale, '血鉀', 'Potassium')] : []),
        ...(!profile.facts.bicarbonate ? [text(locale, '碳酸氫鹽／總二氧化碳', 'Bicarbonate/total CO2')] : []),
      ]
    : []
  const status: CdssRecommendation['status'] = potassiumAbnormal || importantAcidosis
    ? 'review'
    : missing.length > 0
      ? 'needs-data'
      : 'no-action'

  return {
    id: 'ckd-potassium-acidosis',
    domain: 'complication',
    priority: potassiumAbnormal ? 'high' : status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: importantAcidosis ? 'bicarbonate' : 'potassium',
    title: potassiumAbnormal
      ? text(locale, `血鉀 ${potassium} mmol/L：評估鉀異常`, `Potassium ${potassium} mmol/L: assess the abnormality`)
      : importantAcidosis
        ? text(
            locale,
            `Bicarbonate ${bicarbonate} mmol/L：評估具臨床重要性的代謝性酸中毒`,
            `Bicarbonate ${bicarbonate} mmol/L: assess clinically important metabolic acidosis`,
          )
        : missing.length > 0
          ? text(locale, `${stage}：鉀與酸鹼監測尚缺 ${missing.length} 項`, `${stage}: potassium/acid-base monitoring is missing ${missing.length} item(s)`)
          : text(
              locale,
              `鉀與酸鹼數值已判讀；${bicarbonate !== undefined ? `bicarbonate ${bicarbonate} mmol/L` : '目前資料'}未觸發重要酸中毒提示`,
              `Potassium and acid-base values interpreted; ${bicarbonate !== undefined ? `bicarbonate ${bicarbonate} mmol/L` : 'current data'} does not trigger an important-acidosis prompt`,
            ),
    recommendation: text(
      locale,
      importantAcidosis
        ? `Bicarbonate ${bicarbonate} mmol/L 低於 KDIGO 2024 所舉具臨床重要酸中毒的範例門檻 18 mmol/L；先確認檢驗與臨床狀態、評估原因，再決定處理。`
        : potassiumAbnormal
          ? '先確認檢驗可靠性、急性病況、藥物、飲食與腎功能，再依院內流程處理鉀異常。'
          : bicarbonate !== undefined && bicarbonate >= 18
            ? `Bicarbonate ${bicarbonate} mmol/L 未達 <18 mmol/L 的重要酸中毒提示門檻，不因本數值自動啟動治療。`
            : '依 CKD 分期與臨床狀況核對鉀與酸鹼資料。',
      importantAcidosis
        ? `Bicarbonate ${bicarbonate} mmol/L is below the KDIGO 2024 example threshold of 18 mmol/L for clinically important acidosis. Confirm the result and clinical state, assess causes, and then decide management.`
        : potassiumAbnormal
          ? 'Confirm result reliability, acute illness, medicines, diet, and kidney function, then manage using the institutional pathway.'
          : bicarbonate !== undefined && bicarbonate >= 18
            ? `Bicarbonate ${bicarbonate} mmol/L does not meet the below-18 prompt threshold for clinically important acidosis and does not trigger treatment automatically.`
            : 'Review potassium and acid-base data according to CKD stage and clinical context.',
    ),
    rationale: text(
      locale,
      'CKD、藥物與急性病況都可能造成鉀或酸鹼異常，需將數值與臨床情境一起判讀。',
      'CKD, medications, and acute illness can all cause potassium or acid-base abnormalities; values require clinical context.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      patientEvidence(profile, locale, 'bicarbonate', '碳酸氫鹽／總二氧化碳', 'Bicarbonate/total CO2'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'medicationListOverview', '目前用藥資料', 'Current medication data'),
    ]),
    missingData: missing,
    nextActions: [text(
      locale,
      status === 'review'
        ? '複核檢驗與臨床狀態，查找近期藥物變動並依嚴重度與院內流程處理。'
        : '先查找缺項的既有檢驗；需要時才安排採檢。',
      status === 'review'
        ? 'Verify the laboratory and clinical state, review recent medication changes, and manage according to severity and the institutional pathway.'
        : 'Retrieve existing results for missing items first and test only when needed.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      'K 3.5–5.5 mmol/L 與 bicarbonate ≥18 mmol/L 僅代表未觸發本卡門檻，不等同完全正常或不需追蹤。',
      'Potassium 3.5–5.5 mmol/L and bicarbonate at least 18 mmol/L only mean this card’s thresholds are not triggered; they do not prove complete normality or eliminate follow-up.',
    ),
  }
}

function buildCkdMbd(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const stage = stageFromProfile(profile)
  if (!isG3ToG5(stage)) return undefined
  const required = [
    ['calcium', '血鈣', 'Calcium'],
    ['phosphate', '血磷', 'Phosphate'],
    ['parathyroidHormone', 'PTH', 'PTH'],
  ] as const
  const missing = required.filter(([key]) => !profile.facts[key])
  const status: CdssRecommendation['status'] = missing.length > 0 ? 'needs-data' : 'no-action'

  return {
    id: 'ckd-mbd-monitoring',
    domain: 'complication',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: profile.facts.parathyroidHormone ? 'parathyroidHormone' : 'eGFR',
    title: missing.length > 0
      ? text(locale, `${stage} CKD-MBD 評估尚缺 ${missing.length} 項`, `${stage} CKD-MBD assessment is missing ${missing.length} item(s)`)
      : text(locale, 'CKD-MBD 核心檢驗已有可用紀錄', 'Core CKD-MBD laboratory records are available'),
    recommendation: text(
      locale,
      missing.length > 0
        ? '先查完整病歷；依 CKD 分期與既有趨勢補齊鈣、磷與 PTH，必要時納入 alkaline phosphatase 與 25-OH vitamin D。'
        : '以連續的血磷、血鈣與 PTH 共同判讀；不要由單一數值自動診斷 CKD-MBD 或啟動治療。',
      missing.length > 0
        ? 'Review the complete chart and complete calcium, phosphate, and PTH according to CKD stage and prior trends; add alkaline phosphatase and 25-OH vitamin D when indicated.'
        : 'Interpret serial phosphate, calcium, and PTH together; do not diagnose CKD-MBD or initiate therapy automatically from one value.',
    ),
    rationale: text(
      locale,
      'KDIGO CKD-MBD 建議依連續的磷、鈣與 PTH 整體判讀，而不是只看一個異常值。',
      'KDIGO CKD-MBD recommends decisions based on serial phosphate, calcium, and PTH considered together rather than one abnormal value.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'calcium', '血鈣', 'Calcium'),
      patientEvidence(profile, locale, 'phosphate', '血磷', 'Phosphate'),
      patientEvidence(profile, locale, 'parathyroidHormone', 'PTH', 'PTH'),
      patientEvidence(profile, locale, 'alkalinePhosphatase', 'Alkaline phosphatase', 'Alkaline phosphatase'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
    ]),
    missingData: missing.map(([, zh, en]) => text(locale, zh, en)),
    nextActions: [text(
      locale,
      '核對採檢日期、趨勢與實驗室參考值；缺項先查既有結果，再依分期安排。',
      'Review collection dates, trends, and laboratory reference ranges; retrieve existing results before ordering missing tests according to stage.',
    )],
    guidelineReferences: [{
      id: 'KDIGO-CKD-MBD-2017-4.1.1',
      title: 'KDIGO 2017 Clinical Practice Guideline Update for CKD-MBD',
      publisher: 'Kidney Disease: Improving Global Outcomes',
      version: '2017',
      url: 'https://kdigo.org/wp-content/uploads/2018/04/2017-KDIGO-CKD-MBD-GL-Update.pdf#page=17',
      directLink: true,
      page: 17,
      recommendationId: 'Recommendation 4.1.1',
      locator: text(
        locale,
        '第 4.1 節 → CKD-MBD 生化異常',
        'Section 4.1 → CKD-MBD biochemical abnormalities',
      ),
      summary: text(
        locale,
        'CKD G3a–G5D 的處置應依連續的血磷、血鈣與 PTH 整體判讀。',
        'In CKD G3a–G5D, decisions should be based on serial phosphate, calcium, and PTH considered together.',
      ),
      citedStatements: [{
        label: 'Recommendation 4.1.1',
        text: 'In patients with CKD G3a–G5D, treatments of CKD-MBD should be based on serial assessments of phosphate, calcium, and PTH levels, considered together (Not Graded).',
      }],
    }],
    safetyBoundary: text(
      locale,
      '本卡不設定跨實驗室通用的 PTH／磷治療門檻，也不由單次檢驗自動給藥。',
      'This card does not impose universal PTH/phosphate treatment thresholds across laboratories and never treats from a single result.',
    ),
  }
}

function buildNutrition(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const stage = stageFromProfile(profile)
  if (!isG3ToG5(stage)) return undefined
  const age = numberFromFact(profile, 'age')
  const vulnerable = (
    (age !== undefined && age >= 65)
    || profile.olderAdultContext?.frailtyStatus === 'frail'
    || profile.olderAdultContext?.frailtyStatus === 'prefrail'
  )

  return {
    id: 'ckd-nutrition',
    domain: 'target',
    priority: vulnerable ? 'medium' : 'routine',
    status: 'review',
    overviewEvidenceFactKey: profile.facts.albumin ? 'albumin' : 'eGFR',
    title: vulnerable
      ? text(locale, `${stage} 高齡／脆弱情境：營養目標需避免過度限制`, `${stage} older/vulnerable context: avoid over-restrictive nutrition targets`)
      : text(locale, `${stage}：檢視蛋白質、鈉與整體飲食品質`, `${stage}: review protein, sodium, and overall diet quality`),
    recommendation: text(
      locale,
      vulnerable
        ? '先評估體重趨勢、食慾、肌少症／衰弱與實際攝取，再個人化蛋白質與熱量；不要僵硬套用低蛋白。鈉攝取可朝 <2 g/day 調整，但仍需兼顧營養與病人偏好。'
        : '成人 G3–G5 可將蛋白質約 0.8 g/kg/day、避免 >1.3 g/kg/day，鈉 <2 g/day 作為營養師共同討論的參考，並優先健康、多樣與較多植物性食物。',
      vulnerable
        ? 'First assess weight trend, appetite, sarcopenia/frailty, and actual intake, then individualize protein and calories; do not apply a low-protein diet rigidly. Sodium below 2 g/day can be discussed while preserving nutrition and patient preferences.'
        : 'For adults with G3–G5, discuss protein around 0.8 g/kg/day, avoidance of intake above 1.3 g/kg/day, and sodium below 2 g/day with a renal dietitian while prioritizing a healthy, diverse, plant-forward diet.',
    ),
    rationale: text(
      locale,
      'KDIGO 的一般蛋白質與鈉目標需由腎臟營養專業依共病個人化；高齡合併衰弱或肌少症者可能需要較高蛋白與熱量。',
      'KDIGO protein and sodium targets require renal-nutrition individualization; older adults with frailty or sarcopenia may need higher protein and calorie targets.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'albumin', '白蛋白', 'Albumin'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      patientEvidence(profile, locale, 'phosphate', '血磷', 'Phosphate'),
    ]),
    missingData: [
      text(locale, '體重與近期體重變化', 'Weight and recent weight trend'),
      text(locale, '食慾、實際蛋白質／鈉攝取與飲食型態', 'Appetite, actual protein/sodium intake, and dietary pattern'),
      text(locale, '肌少症、衰弱與營養風險評估', 'Sarcopenia, frailty, and nutrition-risk assessment'),
    ],
    nextActions: [text(
      locale,
      '有營養風險、進階 CKD 或多重飲食限制時，轉介腎臟營養師共同設定可執行目標。',
      'For nutrition risk, advanced CKD, or multiple dietary restrictions, involve a renal dietitian to set feasible goals.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '白蛋白不是單獨的營養診斷；未先評估肌少症、熱量與代謝穩定性前，不自動建議低或極低蛋白飲食。',
      'Albumin alone is not a nutrition diagnosis; do not recommend a low- or very-low-protein diet automatically without assessing sarcopenia, calories, and metabolic stability.',
    ),
  }
}

function buildReferralCare(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const stage = stageFromProfile(profile)
  const careProgram = profile.facts.ckdCareProgram
  const overlap = profile.facts.ckdCareProgramOverlap
  const hasDiabetes = profile.eligibleDiseasePackIds?.includes('dm-poc') === true
  const requiresReferral = stage === 'G4' || stage === 'G5'
  const considerEarlyReferral = stage === 'G3b' && hasDiabetes
  const status = overlap
    ? 'review'
    : (requiresReferral || considerEarlyReferral) && !careProgram
      ? requiresReferral ? 'actionable' : 'review'
      : 'no-action'

  return {
    id: 'ckd-referral-care',
    domain: 'care-gap',
    priority: status === 'actionable' ? 'high' : status === 'review' ? 'medium' : 'routine',
    status,
    overviewEvidenceFactKey: overlap
      ? 'ckdCareProgramOverlap'
      : careProgram
        ? 'ckdCareProgram'
        : 'eGFR',
    title: overlap
      ? text(
          locale,
          '同時存在初期 CKD 與 Pre-ESRD 照護計畫，需核對主責路徑',
          'Both Early CKD and Pre-ESRD care plans are active; reconcile the responsible pathway',
        )
      : status === 'actionable'
        ? text(
            locale,
            `${stage}：核對腎臟專科轉介與多專業照護`,
            `${stage}: verify nephrology referral and multidisciplinary care`,
          )
        : status === 'review'
          ? text(
              locale,
              `${stage} 糖尿病腎臟病：評估提早腎臟專科共同照護`,
              `${stage} diabetic kidney disease: consider earlier nephrology co-management`,
            )
          : text(
              locale,
              careProgram
                ? 'CKD 照護計畫已有進行中紀錄'
                : '目前未觸發本版的專科轉介提示',
              careProgram
                ? 'An active CKD care plan is documented'
                : 'No specialist-referral prompt is triggered in this version',
            ),
    recommendation: text(
      locale,
      overlap
        ? '確認目前應由初期 CKD 或 Pre-ESRD 哪一條路徑主責，避免重複收案或彼此矛盾的追蹤計畫。'
        : status === 'actionable'
          ? '查找是否已由腎臟專科與多專業團隊照護；若沒有，依院內轉介流程處理。'
          : status === 'review'
            ? '結合腎功能趨勢、白蛋白尿、KFRE、共病與病人目標，評估提早共同照護。'
            : '維持既有照護路徑，並依病程變化重新評估轉介條件。',
      overlap
        ? 'Confirm whether Early CKD or Pre-ESRD is the responsible pathway to avoid duplicate enrollment or conflicting follow-up plans.'
        : status === 'actionable'
          ? 'Determine whether nephrology and multidisciplinary care are already in place; if not, follow the institutional referral workflow.'
          : status === 'review'
            ? 'Use kidney-function trend, albuminuria, KFRE, comorbidity, and patient goals to consider earlier co-management.'
            : 'Continue the current care pathway and reassess referral criteria as the disease course changes.',
    ),
    rationale: text(
      locale,
      '台灣指引建議 G4-G5 轉腎臟專科；糖尿病腎臟病可於 G3b 提早轉介。',
      'The Taiwan guideline recommends nephrology referral for G4-G5 and earlier referral at G3b for diabetic kidney disease.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'ckdDiagnosis', 'CKD 診斷', 'CKD diagnosis'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'ckdCareProgram', '照護計畫', 'Care plan'),
      patientEvidence(profile, locale, 'ckdCareProgramOverlap', '路徑重疊', 'Pathway overlap'),
    ]),
    missingData: status === 'actionable' || status === 'review'
      ? [text(locale, '腎臟專科／多專業團隊目前追蹤狀態', 'Current nephrology/multidisciplinary follow-up status')]
      : [],
    nextActions: [text(
      locale,
      overlap
        ? '核對兩筆 CarePlan 的有效期、收案單位與主責團隊，保留正確的現行照護路徑。'
        : '先查完整病歷的轉介、CarePlan 與團隊照護紀錄，再決定是否新增轉介。',
      overlap
        ? 'Reconcile the periods, enrolling services, and responsible teams for both CarePlans, retaining the correct current pathway.'
        : 'Search the full chart for referral, CarePlan, and team-care records before adding a referral.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      'CarePlan 是照護路徑代理資訊，不等同已完成腎臟專科評估；轉介仍依完整病歷與院內流程。',
      'A CarePlan is a proxy for the care pathway and does not prove a completed nephrology assessment; referral still depends on the complete chart and institutional workflow.',
    ),
  }
}

function toAutomatedCheck(item: CdssRecommendation) {
  const overview = item.patientEvidence.find((evidence) => (
    item.overviewEvidenceFactKey
      ? evidence.factKeys.includes(item.overviewEvidenceFactKey)
      : false
  )) ?? item.patientEvidence[0]
  return {
    id: item.id,
    label: item.title,
    value: overview
      ? `${overview.label}：${overview.value}`
      : item.nextActions[0],
    factKeys: item.patientEvidence.flatMap((evidence) => evidence.factKeys),
    sources: item.patientEvidence.flatMap((evidence) => evidence.sources ?? []),
  }
}

export const CKD_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'ckd-cdss',
  diseaseCode: 'CKD',
  version: '0.3.0-poc',
  enabled: true,
  label: {
    zh: '慢性腎臟病',
    en: 'Chronic kidney disease',
  },
  applies(profile) {
    return profile.eligibleDiseasePackIds?.includes('ckd-poc') === true
  },
  build({ profile, locale }) {
    const recommendations = [
      buildClassification(profile, locale),
      buildMonitoring(profile, locale),
      buildKidneyFailureRisk(profile, locale),
      buildBloodPressureVolume(profile, locale),
      buildRasStrategy(profile, locale),
      buildSglt2Strategy(profile, locale),
      buildFinerenoneStrategy(profile, locale),
      buildCardiovascularRisk(profile, locale),
      buildMedicationSafety(profile, locale),
      buildAnemiaMonitoring(profile, locale),
      buildPotassiumAcidosis(profile, locale),
      buildCkdMbd(profile, locale),
      buildNutrition(profile, locale),
      IMMUNIZATION_CLINICAL_MODULE.build({ profile, locale }),
      buildReferralCare(profile, locale),
    ].filter((item): item is CdssRecommendation => Boolean(item))

    const priorityOrder: Readonly<Record<CdssRecommendation['priority'], number>> = {
      high: 0,
      medium: 1,
      routine: 2,
    }
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    // KFRE is a longitudinal risk module, not merely a completed safety check.
    // Keep it visible as a primary card even when the current risk is below
    // KDIGO action thresholds, so clinicians can see and document the result.
    const automated = recommendations.filter(
      (item) => item.status === 'no-action' && item.id !== 'ckd-kidney-failure-risk',
    )
    const decisions = recommendations.filter(
      (item) => item.status !== 'no-action' || item.id === 'ckd-kidney-failure-risk',
    )
    const enriched = attachKnowledgeAssessments({
      profile,
      locale,
      recommendations: decisions,
      sourceIds: [
        'kdigo-ckd-2024',
        'taiwan-ckd-2025',
        'taiwan-nhi-diabetes',
      ],
    })
    const highPriorityCount = enriched.recommendations.filter(
      (item) => item.priority === 'high',
    ).length
    const needsDataCount = enriched.recommendations.filter(
      (item) => item.status === 'needs-data',
    ).length

    return {
      title: text(locale, '慢性腎臟病個人化照護指引', 'Personalized chronic kidney disease care guidance'),
      summary: text(
        locale,
        `本次依病歷產生 ${decisions.length} 項 CKD 決策提示：${highPriorityCount} 項優先處理、${needsDataCount} 項需先補齊或查找資料。`,
        `This run generated ${decisions.length} CKD decision prompts: ${highPriorityCount} high priority and ${needsDataCount} requiring data retrieval or completion.`,
      ),
      packId: 'ckd-cdss',
      packVersion: '0.3.0-poc',
      knowledgePacks: enriched.knowledgePacks,
      recommendations: enriched.recommendations,
      automatedChecks: automated.map(toAutomatedCheck),
      notEvaluated: [
        text(
          locale,
          'KFRE 採單次 eGFR 與定量 UACR 估算，不取代腎功能趨勢、疾病專屬模型、共病、衰弱程度與病人目標。',
          'KFRE uses single eGFR and quantitative UACR measurements and does not replace kidney-function trajectory, disease-specific models, comorbidity, frailty, or patient goals.',
        ),
        text(
          locale,
          '本版會提示腎功能劑量與腎毒性藥物檢視，但未計算個別藥物劑量或透析時機。',
          'This version prompts renal-dose and nephrotoxin review but does not calculate individual doses or dialysis timing.',
        ),
        text(
          locale,
          '本版不寫回病歷、不開立醫囑，也不取代腎臟專科與完整臨床判斷。',
          'This version does not write to the chart, place orders, or replace nephrology and full clinical judgment.',
        ),
      ],
      disclaimer: text(
        locale,
        'CKD CDSS POC｜依 KDIGO CKD 2024 與台灣 CKD 2025 年 12 月更新版產生唯讀決策支援；執行前仍需核對完整病歷、院內流程與病人目標。',
        'CKD CDSS POC | Read-only decision support based on KDIGO CKD 2024 and the December 2025 Taiwan CKD guideline. Verify the full chart, institutional workflow, and patient goals before acting.',
      ),
    }
  },
}
