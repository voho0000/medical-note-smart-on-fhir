import type {
  CdssFact,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
  ClinicalEvidence,
  ClinicalGuidelinePack,
  GuidelineReference,
} from '../types'

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function numberFromFact(profile: CdssPatientProfile, key: string): number | undefined {
  const value = profile.facts[key]?.numericValue
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function evidence(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  key: string,
  zh: string,
  en: string,
): ClinicalEvidence | undefined {
  const fact = profile.facts[key]
  if (!fact) return undefined
  return {
    label: text(locale, zh, en),
    value: fact[locale === 'en' ? 'en' : 'zh'],
    factKeys: [key],
    sources: fact.sources,
  }
}

function compact(values: readonly (ClinicalEvidence | undefined)[]): ClinicalEvidence[] {
  return values.filter((value): value is ClinicalEvidence => Boolean(value))
}

function ageDays(fact: CdssFact | undefined, evaluatedAt?: string): number | undefined {
  if (!fact?.date || !evaluatedAt) return undefined
  const measured = Date.parse(fact.date)
  const evaluated = Date.parse(evaluatedAt)
  if (!Number.isFinite(measured) || !Number.isFinite(evaluated)) return undefined
  return Math.max(0, Math.floor((evaluated - measured) / 86_400_000))
}

function eGfrDrop(profile: CdssPatientProfile): number | undefined {
  const values = (profile.facts.eGFRTrend?.sources ?? [])
    .map((source) => typeof source.value === 'number' ? source.value : undefined)
    .filter((value): value is number => value !== undefined && value > 0)
  if (values.length < 2) return undefined
  const previous = values.at(-2)!
  const latest = values.at(-1)!
  return latest < previous ? Math.round(((previous - latest) / previous) * 1000) / 10 : 0
}

function kdigoReference(locale: CdssLocale): GuidelineReference {
  return {
    id: 'kdigo-ckd-2024-hyperkalemia',
    title: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease',
    publisher: 'Kidney Disease: Improving Global Outcomes (KDIGO)',
    version: '2024',
    url: 'https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf#page=110',
    page: 110,
    locator: 'Table 26 and Section 3.11',
    summary: text(
      locale,
      '高血鉀處理先核對可修正因素、急性病況與可能升鉀藥物；飲食建議需個人化，不應把所有天然含鉀食物一律禁用。',
      'Hyperkalemia management begins with correctable factors, acute illness, and potassium-raising medications. Dietary advice should be individualized rather than broadly excluding all naturally potassium-rich foods.',
    ),
  }
}

function ukkaReference(locale: CdssLocale): GuidelineReference {
  return {
    id: 'ukka-hyperkalemia-community-recheck-2023',
    title: 'UK Kidney Association Clinical Practice Guideline: Management of Hyperkalaemia in Adults',
    publisher: 'UK Kidney Association',
    version: 'October 2023',
    url: 'https://guidelines.ukkidney.org/hyperkalaemia/',
    directLink: true,
    recommendationId: 'Guidelines 1.1–1.2, 4.1–4.2',
    summary: text(
      locale,
      '社區新發 K 5.5–5.9 mmol/L 建議 3 日內複驗、6.0–6.4 建議 1 日內複驗；K ≥6.5 建議立即住院評估。急性不適或 AKI 會提高處理急迫性。',
      'For a new community result, repeat potassium within 3 days at 5.5–5.9 mmol/L and within 1 day at 6.0–6.4 mmol/L; potassium at least 6.5 mmol/L warrants immediate hospital assessment. Acute illness or AKI increases urgency.',
    ),
  }
}

function buildPotassiumTriage(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const potassium = numberFromFact(profile, 'potassium')
  const days = ageDays(profile.facts.potassium, profile.evaluatedAt)
  const hasCurrentAki = profile.akiAssessment?.event?.recency === 'current-window'

  if (potassium === undefined) {
    return {
      id: 'renal-safety-potassium-triage',
      domain: 'safety',
      priority: hasCurrentAki ? 'high' : 'medium',
      status: 'needs-data',
      overviewEvidenceFactKey: 'eGFR',
      title: text(locale, '腎功能風險情境缺少可治理的血鉀', 'No governed potassium result is available in this kidney-risk context'),
      recommendation: text(
        locale,
        '查找近期原始檢驗與溶血註記；若病人有無力、心悸、暈厥、少尿或急性病況，不等待健康存摺資料。',
        'Retrieve a recent source result and hemolysis comment. Do not wait for My Health Bank data when weakness, palpitations, syncope, oliguria, or acute illness is present.',
      ),
      rationale: text(locale, '缺少血鉀代表無法分級，不代表血鉀正常。', 'Missing potassium prevents triage; it does not mean potassium is normal.'),
      patientEvidence: compact([
        evidence(profile, locale, 'akiCreatinineSignal', 'AKI 訊號', 'AKI signal'),
        evidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      ]),
      missingData: [text(locale, '近期血鉀、採檢時間與溶血註記', 'Recent potassium, collection time, and hemolysis comment')],
      nextActions: [text(locale, '依臨床急迫性取得可核對的血鉀。', 'Obtain a verifiable potassium result according to clinical urgency.')],
      guidelineReferences: [kdigoReference(locale), ukkaReference(locale)],
      safetyBoundary: text(locale, '本模組不會從 eGFR 或藥名推算血鉀。', 'This module never infers potassium from eGFR or medication names.'),
    }
  }

  const historical = days === undefined || days > 1
  const severe = potassium >= 6.5
  const moderate = potassium >= 6 && potassium < 6.5
  const mild = potassium >= 5.5 && potassium < 6
  const low = potassium < 3.5
  const abnormal = severe || moderate || mild || low
  const priority = abnormal ? 'high' as const : 'routine' as const
  const status = abnormal
    ? historical ? 'review' as const : 'actionable' as const
    : 'no-action' as const

  const title = severe
    ? text(locale, `K ${potassium} mmol/L${historical ? '（歷史結果）' : '：立即核對與急症評估'}`, `Potassium ${potassium} mmol/L${historical ? ' (historical result)' : ': immediate verification and emergency assessment'}`)
    : moderate
      ? text(locale, `K ${potassium} mmol/L${historical ? '（歷史結果）' : '：當日核對與緊急評估'}`, `Potassium ${potassium} mmol/L${historical ? ' (historical result)' : ': same-day verification and urgent assessment'}`)
      : mild
        ? text(locale, `K ${potassium} mmol/L${historical ? '（歷史結果）' : '：儘速複驗與原因盤點'}`, `Potassium ${potassium} mmol/L${historical ? ' (historical result)' : ': prompt repeat testing and cause review'}`)
        : low
          ? text(locale, `K ${potassium} mmol/L：評估低血鉀`, `Potassium ${potassium} mmol/L: assess hypokalemia`)
          : text(locale, `K ${potassium} mmol/L：本次未觸發鉀異常門檻`, `Potassium ${potassium} mmol/L: no potassium alert threshold triggered`)

  return {
    id: 'renal-safety-potassium-triage',
    domain: 'safety',
    priority,
    status,
    overviewEvidenceFactKey: 'potassium',
    title,
    recommendation: historical && abnormal
      ? text(
          locale,
          '先查找此結果是否已處置及後續血鉀；不要把歷史危險值直接當作病人現在的數值，也不要忽略未完成的閉環。',
          'First determine whether this result was managed and whether a later potassium exists. Do not treat a historical critical value as the current value, but do not ignore an unclosed event.',
        )
      : severe
        ? text(locale, '立即重驗確認、取得 12 導程 ECG，並依急症／住院流程處理；有症狀或 ECG 變化時不等待複驗。', 'Immediately verify the result, obtain a 12-lead ECG, and follow the emergency/hospital pathway. Do not wait for repeat testing when symptoms or ECG changes are present.')
        : moderate
          ? text(locale, '當日核對採檢品質、臨床狀態與 ECG 需要，最遲 1 日內完成複驗；合併 AKI 或急性不適時升級評估。', 'Review sample quality, clinical status, and need for ECG the same day, with repeat testing within 1 day at the latest; escalate when AKI or acute illness is present.')
          : mild
            ? text(locale, '核對溶血、腎功能、酸鹼與用藥；原則上 3 日內複驗，合併 AKI、快速惡化或急性不適時更早處理。', 'Check hemolysis, kidney function, acid-base status, and medications; generally repeat within 3 days, sooner with AKI, rapid deterioration, or acute illness.')
            : low
              ? text(locale, '核對症狀、ECG 風險、鎂、腸胃或腎臟流失及用藥，再依嚴重度處理。', 'Review symptoms, ECG risk, magnesium, gastrointestinal or renal losses, and medications, then manage according to severity.')
              : text(locale, '保留例行監測；若檢驗已過時或腎功能／用藥近期變動，依臨床情境提前複驗。', 'Continue routine monitoring; repeat earlier when the result is stale or kidney function or medications recently changed.'),
    rationale: text(locale, '血鉀數值、結果時效、AKI／急性病況與心電圖風險共同決定急迫性。', 'Potassium value, result recency, AKI/acute illness, and ECG risk jointly determine urgency.'),
    patientEvidence: compact([
      evidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      evidence(profile, locale, 'akiCreatinineSignal', 'AKI 訊號', 'AKI signal'),
      evidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      evidence(profile, locale, 'bicarbonate', 'bicarbonate', 'Bicarbonate'),
    ]),
    missingData: abnormal
      ? [
          text(locale, '溶血註記與重驗結果', 'Hemolysis comment and repeat result'),
          text(locale, '症狀、生命徵象與 ECG', 'Symptoms, vital signs, and ECG'),
        ]
      : [],
    nextActions: [
      text(locale, '由臨床人員確認結果時效與病人當下狀況，再啟動院內處置路徑。', 'Have a clinician verify result recency and current patient status before activating the institutional pathway.'),
    ],
    guidelineReferences: [ukkaReference(locale), kdigoReference(locale)],
    safetyBoundary: text(locale, '系統不會自動給藥、停藥或把健康存摺的歷史數值當作即時床邊檢驗。', 'The system does not administer or stop medication and never treats a historical My Health Bank value as a real-time bedside result.'),
  }
}

function buildKidneyDeterioration(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const aki = profile.akiAssessment?.event
  const drop = eGfrDrop(profile)
  const deterioration = Boolean(aki) || (drop !== undefined && drop > 20)

  return {
    id: 'renal-safety-kidney-deterioration',
    domain: 'monitoring',
    priority: aki?.recency === 'current-window' ? 'high' : deterioration ? 'medium' : 'routine',
    status: aki?.recency === 'current-window'
      ? 'actionable'
      : deterioration
        ? 'review'
        : profile.facts.eGFRTrend || profile.akiAssessment
          ? 'no-action'
          : 'needs-data',
    overviewEvidenceFactKey: aki ? 'akiCreatinineSignal' : 'eGFRTrend',
    title: aki
      ? text(locale, `Creatinine 型 AKI 第 ${aki.stage} 期訊號需閉環`, `Creatinine-defined AKI stage ${aki.stage} signal requires closure`)
      : drop !== undefined && drop > 20
        ? text(locale, `相鄰 eGFR 下降 ${drop}%：核對是否超出預期變異`, `Adjacent eGFR decreased ${drop}%: verify whether this exceeds expected variability`)
        : text(locale, '現有可比資料未觸發腎功能惡化門檻', 'Available comparable data did not trigger a kidney-deterioration threshold'),
    recommendation: deterioration
      ? text(locale, '核對原始檢驗、時間軸、體液狀態、急性病因與治療變動；安排明確負責人的複驗與結果回看。', 'Verify source results, timeline, volume status, acute causes, and treatment changes; assign repeat testing and result review to a named owner.')
      : text(locale, '保留趨勢監測；臨床懷疑時以院內即時 creatinine、尿量與完整病歷為準。', 'Continue trend monitoring; when clinically suspected, use real-time institutional creatinine, urine output, and the complete chart.'),
    rationale: text(locale, 'KDIGO 將 eGFR 變化 >20% 視為超出預期變異、需要評估；AKI 訊號則需依急性流程確認。', 'KDIGO considers an eGFR change greater than 20% beyond expected variability and requiring evaluation; an AKI signal requires confirmation through the acute pathway.'),
    patientEvidence: compact([
      evidence(profile, locale, 'akiCreatinineSignal', 'AKI 訊號', 'AKI signal'),
      evidence(profile, locale, 'serumCreatinineTrend', 'creatinine 趨勢', 'Creatinine trend'),
      evidence(profile, locale, 'eGFRTrend', 'eGFR 趨勢', 'eGFR trend'),
    ]),
    missingData: deterioration
      ? [text(locale, '尿量、體液狀態、急性病因與近期治療變動', 'Urine output, volume status, acute cause, and recent treatment changes')]
      : [],
    nextActions: [text(locale, '把複驗時點與結果回看責任寫入照護計畫。', 'Document the repeat-testing interval and result-review owner in the care plan.')],
    guidelineReferences: [kdigoReference(locale)],
    safetyBoundary: text(locale, '相鄰 eGFR 百分比只是一個需核對的變化訊號，不等同 AKI 診斷或藥物副作用歸因。', 'The adjacent eGFR percentage is a change signal for verification, not an AKI diagnosis or attribution to a medication.'),
  }
}

function buildMedicationSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const potassium = numberFromFact(profile, 'potassium')
  const hyperkalemia = potassium !== undefined && potassium >= 5.5
  const deterioration = Boolean(profile.akiAssessment?.event) || (eGfrDrop(profile) ?? 0) > 20
  const riskMedication = Boolean(profile.facts.currentHyperkalemiaRiskMedication)
  const nephrotoxin = Boolean(profile.facts.currentPotentialNephrotoxin)
  const triggered = hyperkalemia || deterioration || riskMedication || nephrotoxin

  return {
    id: 'renal-safety-medication-reconciliation',
    domain: 'medication',
    priority: (hyperkalemia || deterioration) && (riskMedication || nephrotoxin) ? 'high' : triggered ? 'medium' : 'routine',
    status: triggered ? 'review' : profile.facts.medicationListOverview ? 'no-action' : 'needs-data',
    overviewEvidenceFactKey: nephrotoxin
      ? 'currentPotentialNephrotoxin'
      : riskMedication
        ? 'currentHyperkalemiaRiskMedication'
        : 'medicationListOverview',
    title: triggered
      ? text(locale, '完成升鉀／腎毒性藥物與腎功能劑量盤點', 'Complete potassium-raising, nephrotoxic, and kidney-dose medication review')
      : text(locale, '現有清單未辨識到本版規則涵蓋的升鉀／腎毒性線索', 'No potassium-raising or nephrotoxic clue covered by this ruleset was identified'),
    recommendation: text(
      locale,
      '核對實際服用、最後一劑、近期新藥、非處方藥、草藥、鉀補充品、顯影劑與院內給藥；逐一評估適應症、劑量、暫停／續用及重啟條件。',
      'Reconcile actual use, last dose, new medications, over-the-counter drugs, herbs, potassium supplements, contrast, and inpatient administrations; review indication, dose, hold/continue decision, and restart criteria item by item.',
    ),
    rationale: text(locale, '處方或調劑紀錄不等於實際使用，且多種藥物會影響血鉀或在腎功能惡化時需要調整。', 'Prescription or dispensing records do not prove actual use, and many drugs affect potassium or require adjustment during kidney deterioration.'),
    patientEvidence: compact([
      evidence(profile, locale, 'currentHyperkalemiaRiskMedication', '可能升鉀藥物', 'Potential potassium-raising medication'),
      evidence(profile, locale, 'currentPotentialNephrotoxin', '潛在腎毒性藥物', 'Potential nephrotoxin'),
      evidence(profile, locale, 'currentNsaid', 'NSAID', 'NSAID'),
      evidence(profile, locale, 'medicationListOverview', '可見用藥', 'Visible medication list'),
      evidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
    ]),
    missingData: [
      text(locale, '實際服藥、非處方藥／草藥與最後一劑時間', 'Actual use, OTC drugs/herbs, and last-dose timing'),
      text(locale, '近期顯影劑與院內給藥', 'Recent contrast and inpatient administrations'),
    ],
    nextActions: [text(locale, '由醫師或藥師記錄逐項決策與後續監測／重啟計畫。', 'Have a clinician or pharmacist document each decision and the monitoring/restart plan.')],
    guidelineReferences: [kdigoReference(locale)],
    safetyBoundary: text(locale, '不因單一檢驗或字串比對自動停藥；RASi、MRA、利尿劑與 SGLT2i 都需依個別風險與適應症判斷。', 'No drug is stopped automatically from one result or a text match; RAS inhibitors, MRAs, diuretics, and SGLT2 inhibitors require individualized risk-benefit review.'),
  }
}

export const RENAL_SAFETY_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'renal-safety-cdss',
  diseaseCode: 'RENAL-SAFETY',
  version: '1.0.0',
  enabled: true,
  label: { zh: '血鉀／腎功能安全', en: 'Potassium/kidney safety' },
  applies(profile) {
    return Boolean(
      profile.facts.potassium
      || profile.facts.eGFR
      || profile.facts.serumCreatinine
      || profile.facts.ckdDiagnosis,
    )
  },
  build({ profile, locale }) {
    const recommendations = [
      buildPotassiumTriage(profile, locale),
      buildKidneyDeterioration(profile, locale),
      buildMedicationSafety(profile, locale),
    ]
    return {
      title: text(locale, '高血鉀、腎功能惡化與用藥安全', 'Hyperkalemia, kidney deterioration, and medication safety'),
      summary: text(locale, '以檢驗時效、腎功能趨勢與可見用藥建立可追蹤的安全閉環。', 'Uses laboratory recency, kidney trends, and visible medications to build a traceable safety loop.'),
      packId: 'renal-safety-cdss',
      packVersion: '1.0.0',
      knowledgePacks: [
        {
          id: 'kdigo-ckd-2024',
          kind: 'guideline',
          label: 'KDIGO CKD',
          version: '2024',
          effectiveFrom: '2024-03-01',
        },
        {
          id: 'ukka-hyperkalemia-2023',
          kind: 'guideline',
          label: text(locale, 'UKKA 高血鉀指引', 'UKKA hyperkalemia guideline'),
          version: '2023',
          effectiveFrom: '2023-10-01',
        },
      ],
      recommendations,
      notEvaluated: [
        text(locale, '即時症狀、ECG、溶血、尿量、體液狀態、院內給藥／顯影劑與完整 OTC／草藥清單。', 'Real-time symptoms, ECG, hemolysis, urine output, volume status, inpatient administrations/contrast, and the complete OTC/herbal list.'),
      ],
      disclaimer: text(locale, '唯讀安全提示；不是急診分流、診斷、醫囑或自動停藥系統。危險值與急性症狀須依院內流程立即確認。', 'Read-only safety support; not emergency triage, diagnosis, an order, or an automatic medication-stop system. Critical values and acute symptoms require immediate institutional verification.'),
    }
  },
}
