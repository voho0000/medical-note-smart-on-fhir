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
  const quantitativeUacr = numberFromFact(profile, 'urineAlbuminRatioQuantitative')
    ?? (
      profile.observationContexts?.uacr?.useState === 'quantitative_comparable'
        ? numberFromFact(profile, 'urineAlbuminRatio')
        : undefined
    )
  const demographicSex = profile.demographics?.sex
  const sex: KfreSex | undefined = demographicSex === 'male' || demographicSex === 'female'
    ? demographicSex
    : undefined
  const risk = (
    age !== undefined
    && eGfr !== undefined
    && quantitativeUacr !== undefined
    && quantitativeUacr > 0
    && sex
  )
    ? calculateKfre({
        ageYears: age,
        sex,
        egfrMlMin173m2: eGfr,
        urineAcrMgG: quantitativeUacr,
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
    : exceedsKrtPreparation || exceedsMultidisciplinaryCare
      ? 'high'
      : reachesReferralRange
        ? 'medium'
        : 'routine'
  const status: CdssRecommendation['status'] = !risk
    ? 'needs-data'
    : exceedsKrtPreparation || exceedsMultidisciplinaryCare
      ? 'actionable'
      : reachesReferralRange
        ? 'review'
        : 'no-action'

  const riskTitle = risk
    ? text(
        locale,
        `${gStage} KFRE：2 年 ${twoYearText}%／5 年 ${fiveYearText}%`,
        `${gStage} KFRE: ${twoYearText}% at 2 years / ${fiveYearText}% at 5 years`,
      )
    : undefined
  const recommendation = !risk
    ? text(
        locale,
        '先補齊 KFRE 必要輸入，再使用適用台灣的非北美校正版計算；不得由半定量 UACR 推估。',
        'Complete the required KFRE inputs, then calculate with the non–North American calibration applicable to Taiwan; do not estimate from semiquantitative UACR.',
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
    overviewEvidenceFactKey: quantitativeUacr === undefined
      ? 'urineAlbuminOverview'
      : sex === undefined
        ? 'sex'
        : 'eGFR',
    title: riskTitle
      ?? (
        quantitativeUacr === undefined || quantitativeUacr <= 0
          ? text(
              locale,
              `${gStage}：缺少定量 UACR 或數值無法使用，暫不能計算 KFRE`,
              `${gStage}: quantitative UACR is missing or unusable, so KFRE cannot yet be calculated`,
            )
          : sex === undefined
            ? text(
                locale,
                `${gStage}：缺少公式所需性別，暫不能計算 KFRE`,
                `${gStage}: the sex input required by the equation is missing, so KFRE cannot yet be calculated`,
              )
            : text(
                locale,
                `${gStage}：KFRE 必要輸入不完整`,
                `${gStage}: required KFRE inputs are incomplete`,
              )
      ),
    recommendation,
    rationale: text(
      locale,
      '4 變數 KFRE 使用年齡、性別、eGFR 與定量 UACR，估算 2 年與 5 年內需透析或腎臟移植的絕對風險。',
      'The 4-variable KFRE uses age, sex, eGFR, and quantitative UACR to estimate absolute 2- and 5-year risk of dialysis or kidney transplant.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'age', '年齡', 'Age'),
      patientEvidence(profile, locale, 'sex', '性別', 'Sex'),
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'urineAlbuminOverview', '尿白蛋白', 'Urine albumin'),
    ]),
    missingData: risk
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
          ...(quantitativeUacr === undefined || quantitativeUacr <= 0
            ? [text(locale, '大於 0 的定量 UACR（mg/g）', 'Quantitative UACR above 0 mg/g')]
            : []),
        ],
    nextActions: [text(
      locale,
      risk
        ? '核對 eGFR 與定量 UACR 的日期、單位及穩定性，將 2 年／5 年風險與院內照護流程一併記錄。'
        : '查找或補做必要輸入；資料完整且腎功能穩定後再計算。',
      risk
        ? 'Verify the dates, units, and stability of eGFR and quantitative UACR, then document the 2- and 5-year risks with the local care pathway.'
        : 'Retrieve or obtain the required inputs and calculate only when data are complete and kidney function is stable.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '使用 Tangri 4 變數 KFRE 與已發表的非北美區域校正；僅在成人 CKD G3-G5、eGFR 穩定且定量 UACR 完整時顯示。IgA 腎病或 ADPKD 應評估疾病專屬模型。',
      'Uses the Tangri 4-variable KFRE with the published non–North American calibration and displays a result only for adults with stable CKD G3-G5 and complete quantitative UACR. Consider disease-specific models for IgA nephropathy or ADPKD.',
    ),
  }
}

function buildKidneyProtection(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const eGfr = numberFromFact(profile, 'eGFR')
  const uacr = numberFromFact(profile, 'urineAlbuminRatioQuantitative')
    ?? (
      profile.observationContexts?.uacr?.useState === 'quantitative_comparable'
        ? numberFromFact(profile, 'urineAlbuminRatio')
        : undefined
    )
  const sglt2State = medicationClassState(profile, 'sglt2-inhibitor')
  const aceArbState = medicationClassState(profile, 'ace-inhibitor-or-arb')
  const hasDiabetes = profile.eligibleDiseasePackIds?.includes('dm-poc') === true
  const aStage = classifyUacr(uacr)
  const needsRasReview = (
    (aStage === 'A2' || aStage === 'A3')
    && aceArbState !== 'confirmed-current'
  )
  const sglt2NeedsReconciliation = (
    sglt2State === 'active-order-unconfirmed'
    || sglt2State === 'on-hold'
    || sglt2State === 'historical-record-current-status-unknown'
    || sglt2State === 'uncertain'
  )
  const sglt2Candidate = (
    eGfr !== undefined
    && eGfr >= 20
    && (
      uacr !== undefined && uacr >= 200
      || Boolean(profile.facts.heartFailureDiagnosis)
      || (eGfr <= 45)
    )
  )
  const status = sglt2NeedsReconciliation || needsRasReview || (
    sglt2State === 'not-found' && sglt2Candidate
  ) ? 'review' : uacr === undefined ? 'needs-data' : 'no-action'

  return {
    id: 'ckd-kidney-protection',
    domain: 'medication',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: 'sglt2Therapy',
    title: sglt2NeedsReconciliation
      ? text(
          locale,
          '核對 SGLT2 抑制劑實際使用，並完成 CKD 腎臟保護治療檢視',
          'Reconcile actual SGLT2 inhibitor use and complete the CKD kidney-protection review',
        )
      : aceArbState === 'historical-record-current-status-unknown'
        ? text(
            locale,
            '有 ACEI／ARB 歷史處方，近期是否持續未知',
            'A historical ACE inhibitor/ARB record exists; current use is unknown',
          )
      : sglt2State === 'not-found' && sglt2Candidate
        ? text(
            locale,
            '依 eGFR、UACR／心衰竭條件評估 SGLT2 抑制劑',
            'Evaluate an SGLT2 inhibitor using eGFR and UACR/heart-failure criteria',
          )
        : uacr === undefined
          ? text(
              locale,
              '缺少定量 UACR，RAS 抑制劑適用條件尚未完整',
              'Quantitative UACR is missing, so RAS-inhibitor criteria are incomplete',
            )
          : text(
              locale,
              'CKD 腎臟保護藥物類別已完成自動核對',
              'CKD kidney-protective medication classes checked',
            ),
    recommendation: text(
      locale,
      `${sglt2State === 'confirmed-current' && sglt2Candidate ? '若確認正在使用且耐受，因 CKD／心衰竭的心腎適應症不因 HbA1c 偏低而單獨停藥。' : ''}以 eGFR、定量 UACR、糖尿病、心衰竭、血壓、血鉀、過敏／不耐受與實際用藥狀態共同評估 SGLT2 抑制劑及 ACEI／ARB；不可只看單一數值自動開停藥。`,
      `${sglt2State === 'confirmed-current' && sglt2Candidate ? 'If current use and tolerance are confirmed, do not stop a CKD/heart-failure cardiorenal indication solely because A1c is low. ' : ''}Evaluate SGLT2 inhibitors and ACE inhibitors/ARBs using eGFR, quantitative UACR, diabetes, heart failure, blood pressure, potassium, allergy/intolerance, and actual medication use; do not start or stop therapy automatically from one value.`,
    ),
    rationale: text(
      locale,
      hasDiabetes
        ? '病人同時符合糖尿病與 CKD 路徑；腎臟保護治療需整合兩個疾病情境，但仍各自保留來源與安全條件。'
        : 'CKD 腎臟保護治療可適用於部分非糖尿病患者，需依個別適應症與安全條件判斷。',
      hasDiabetes
        ? 'The patient meets both diabetes and CKD pathways. Kidney-protective treatment should integrate both contexts while retaining each source and safety criterion.'
        : 'Kidney-protective therapy can apply to selected people without diabetes and requires individual indication and safety assessment.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'eGFR', '最新 eGFR', 'Latest eGFR'),
      patientEvidence(profile, locale, 'urineAlbuminOverview', '尿白蛋白', 'Urine albumin'),
      patientEvidence(profile, locale, 'sglt2Therapy', 'SGLT2 抑制劑', 'SGLT2 inhibitor'),
      patientEvidence(profile, locale, 'aceArbTherapy', 'ACEI／ARB', 'ACE inhibitor/ARB'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
    ]),
    missingData: [
      ...(uacr === undefined
        ? [text(locale, '定量 UACR（mg/g）', 'Quantitative UACR (mg/g)')]
        : []),
      ...(sglt2NeedsReconciliation
        ? [text(locale, '實際服用、耐受性、近期急性病況與體液狀態', 'Actual use, tolerance, recent acute illness, and volume status')]
        : []),
      ...(aceArbState === 'historical-record-current-status-unknown'
        ? [text(locale, 'ACEI／ARB 近期是否持續、既往耐受性與停藥原因', 'Current ACE inhibitor/ARB continuation, prior tolerance, and reason it may have stopped')]
        : []),
    ],
    nextActions: [
      text(
        locale,
        '核對實際用藥與適應症。ACEI／ARB 開始、重新開始或增加劑量後 2–4 週檢查血壓、creatinine 與血鉀；dapagliflozin 僅在重大手術／長時間禁食等適當情境暫停，不因顯影劑檢查一律停藥。',
        'Reconcile actual use and indication. Check blood pressure, creatinine, and potassium 2–4 weeks after starting, restarting, or increasing an ACE inhibitor/ARB. Hold dapagliflozin for appropriate situations such as major surgery/prolonged fasting, not universally for contrast exposure.',
      ),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '這是藥物類別核對，不是個別病人的開藥、停藥或劑量指示。',
      'This is a medication-class review, not an instruction to start, stop, or dose a medicine.',
    ),
  }
}

function buildComplicationMonitoring(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const stage = stageFromProfile(profile)
  const advanced = stage === 'G3b' || stage === 'G4' || stage === 'G5'
  const sex = profile.demographics?.sex
  const hemoglobin = numberFromFact(profile, 'hemoglobin')
  const bicarbonate = numberFromFact(profile, 'bicarbonate')
  const potassium = numberFromFact(profile, 'potassium')
  const anemiaThreshold = sex === 'male' ? 13 : sex === 'female' ? 12 : undefined
  const hasAnemia = (
    hemoglobin !== undefined
    && anemiaThreshold !== undefined
    && hemoglobin < anemiaThreshold
  )
  const hasClinicallyImportantAcidosis = (
    bicarbonate !== undefined && bicarbonate < 18
  )
  const hasPotassiumAbnormality = (
    potassium !== undefined && (potassium < 3.5 || potassium > 5.5)
  )
  const required = advanced
    ? [
        ['hemoglobin', '血紅素', 'Hemoglobin'],
        ['potassium', '血鉀', 'Potassium'],
        ['bicarbonate', '碳酸氫鹽／總二氧化碳', 'Bicarbonate/total CO2'],
        ['calcium', '血鈣', 'Calcium'],
        ['phosphate', '血磷', 'Phosphate'],
      ] as const
    : [
        ['hemoglobin', '血紅素', 'Hemoglobin'],
        ['potassium', '血鉀', 'Potassium'],
      ] as const
  const missing = required.filter(([key]) => !profile.facts[key])
  const hasInterpretedAbnormality = (
    hasAnemia || hasClinicallyImportantAcidosis || hasPotassiumAbnormality
  )
  const anemiaWorkup = hasAnemia
    ? [
        text(locale, 'CBC 連續趨勢與網狀紅血球', 'CBC trend and reticulocyte count'),
        text(locale, 'ferritin 與 TSAT', 'Ferritin and TSAT'),
      ]
    : []
  const status: CdssRecommendation['status'] = hasInterpretedAbnormality
    ? 'review'
    : missing.length > 0
      ? 'needs-data'
      : 'no-action'
  const title = hasAnemia
    ? text(
        locale,
        `Hb ${hemoglobin} g/dL：${sex === 'male' ? '男性' : '女性'}貧血，先評估原因與趨勢`,
        `Hemoglobin ${hemoglobin} g/dL: anemia for ${sex === 'male' ? 'a male' : 'a female'} patient; evaluate cause and trend`,
      )
    : hasClinicallyImportantAcidosis
      ? text(
          locale,
          `Bicarbonate ${bicarbonate} mmol/L：評估具臨床重要性的代謝性酸中毒`,
          `Bicarbonate ${bicarbonate} mmol/L: assess clinically important metabolic acidosis`,
        )
      : hasPotassiumAbnormality
        ? text(
            locale,
            `血鉀 ${potassium} mmol/L：評估鉀異常`,
            `Potassium ${potassium} mmol/L: assess the potassium abnormality`,
          )
        : missing.length > 0
          ? text(
              locale,
              `${stage ?? 'CKD'} 併發症監測尚缺 ${missing.length} 項`,
              `${stage ?? 'CKD'} complication monitoring is missing ${missing.length} item(s)`,
            )
          : text(
              locale,
              `${stage ?? 'CKD'} 併發症檢驗已判讀；目前未觸發貧血、鉀異常或重要酸中毒提示`,
              `${stage ?? 'CKD'} complication laboratories interpreted; no anemia, potassium abnormality, or clinically important acidosis prompt is triggered`,
            )

  return {
    id: 'ckd-complication-monitoring',
    domain: 'complication',
    priority: status === 'no-action' ? 'routine' : 'medium',
    status,
    overviewEvidenceFactKey: profile.facts.hemoglobin ? 'hemoglobin' : 'eGFR',
    title,
    recommendation: text(
      locale,
      hasAnemia
        ? `依性別門檻，Hb ${hemoglobin} g/dL 屬貧血。先看 CBC 連續趨勢、網狀紅血球、ferritin 與 TSAT，並評估出血、營養缺乏、發炎及其他原因；單一輕度貧血不直接觸發 ESA。`
        : hasClinicallyImportantAcidosis
          ? `Bicarbonate ${bicarbonate} mmol/L 低於 KDIGO 2024 所舉具臨床重要酸中毒的範例門檻 18 mmol/L；先確認檢驗與臨床狀態、評估原因，再決定處理。`
          : hasPotassiumAbnormality
            ? '先確認檢驗可靠性、急性病況、藥物與腎功能，再依院內流程處理鉀異常。'
            : missing.length > 0
              ? '先查完整病歷是否已有結果；若無，再依 CKD 分期與臨床狀況安排貧血、電解質、酸鹼與礦物質骨代謝評估。'
              : `目前已判讀可用數值；${bicarbonate !== undefined && bicarbonate >= 18 ? `bicarbonate ${bicarbonate} mmol/L 未達 <18 mmol/L 的重要酸中毒提示門檻，不需因此啟動治療。` : '依採檢日期與 CKD 分期持續追蹤。'}`,
      hasAnemia
        ? `Using the sex-specific threshold, hemoglobin ${hemoglobin} g/dL meets anemia criteria. Review the CBC trend, reticulocyte count, ferritin, and TSAT and assess bleeding, nutritional deficiency, inflammation, and other causes; a single mild value does not trigger ESA therapy.`
        : hasClinicallyImportantAcidosis
          ? `Bicarbonate ${bicarbonate} mmol/L is below the KDIGO 2024 example threshold of 18 mmol/L for clinically important acidosis. Confirm the result and clinical state, assess causes, and then decide management.`
          : hasPotassiumAbnormality
            ? 'Confirm result reliability, acute illness, medicines, and kidney function, then manage the potassium abnormality using the institutional pathway.'
            : missing.length > 0
              ? 'Search the complete chart first. If absent, arrange anemia, electrolyte, acid-base, and mineral-bone assessment according to CKD stage and clinical context.'
              : `Available values have been interpreted. ${bicarbonate !== undefined && bicarbonate >= 18 ? `Bicarbonate ${bicarbonate} mmol/L does not meet the <18 mmol/L prompt threshold for clinically important acidosis and does not trigger treatment on that basis.` : 'Continue monitoring according to collection dates and CKD stage.'}`,
    ),
    rationale: text(
      locale,
      'CKD 進展時，腎性貧血、鉀異常、代謝性酸中毒與 CKD-MBD 的風險增加。',
      'As CKD advances, risks of kidney anemia, potassium disorders, metabolic acidosis, and CKD-MBD increase.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'hemoglobin', '血紅素', 'Hemoglobin'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      patientEvidence(profile, locale, 'bicarbonate', '碳酸氫鹽／總二氧化碳', 'Bicarbonate/total CO2'),
      patientEvidence(profile, locale, 'calcium', '血鈣', 'Calcium'),
      patientEvidence(profile, locale, 'phosphate', '血磷', 'Phosphate'),
      patientEvidence(profile, locale, 'albumin', '白蛋白', 'Albumin'),
    ]),
    missingData: [
      ...missing.map(([, zh, en]) => text(locale, zh, en)),
      ...anemiaWorkup,
    ],
    nextActions: [text(
      locale,
      hasAnemia
        ? '查找 CBC trend、reticulocyte、ferritin 與 TSAT；依完整評估結果決定後續，不由 Hb 12.1 g/dL 直接提示 ESA。'
        : hasClinicallyImportantAcidosis
          ? '複核 bicarbonate 與相關臨床狀態，評估酸中毒原因及是否需要處理。'
          : missing.length > 0
        ? '先查找缺項的既有檢驗；需要時才安排採檢，並依結果進一步評估。'
        : '核對採檢日期與異常值；依分期及院內流程安排後續。',
      hasAnemia
        ? 'Retrieve CBC trend, reticulocyte count, ferritin, and TSAT; base next steps on the complete evaluation rather than prompting ESA from hemoglobin 12.1 g/dL alone.'
        : hasClinicallyImportantAcidosis
          ? 'Repeat or verify bicarbonate with the clinical context, assess causes of acidosis, and decide whether treatment is needed.'
          : missing.length > 0
        ? 'Retrieve existing results for missing items first; test only when needed and evaluate further according to results.'
        : 'Review dates and abnormal values, then schedule follow-up according to stage and institutional workflow.',
    )],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '缺少資料不等於已有併發症；單一輕度貧血不直接觸發 ESA，bicarbonate ≥18 mmol/L 不因本規則觸發酸中毒治療。',
      'Missing data do not establish a complication; a single mild anemia result does not trigger ESA therapy, and bicarbonate at or above 18 mmol/L does not trigger acidosis treatment under this rule.',
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
  version: '0.1.0-poc',
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
      buildKidneyProtection(profile, locale),
      buildComplicationMonitoring(profile, locale),
      buildReferralCare(profile, locale),
    ].filter((item): item is CdssRecommendation => Boolean(item))

    const priorityOrder: Readonly<Record<CdssRecommendation['priority'], number>> = {
      high: 0,
      medium: 1,
      routine: 2,
    }
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    const automated = recommendations.filter((item) => item.status === 'no-action')
    const decisions = recommendations.filter((item) => item.status !== 'no-action')
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
      packVersion: '0.2.0-poc',
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
          '本版未計算個別藥物劑量、腎功能劑量調整或透析時機。',
          'This version does not calculate individual medicine doses, renal dose adjustments, or dialysis timing.',
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
