import type {
  CdssLocale,
  CdssMedicationClassId,
  CdssPatientProfile,
  CdssRecommendation,
  ClinicalEvidence,
  ClinicalGuidelinePack,
} from '../types'
import { attachKnowledgeAssessments } from '../knowledge-packs/registry'

type BloodPressure = {
  systolic: number
  diastolic: number
}

const FIRST_LINE_CLASS_IDS: readonly CdssMedicationClassId[] = [
  'ace-inhibitor-or-arb',
  'calcium-channel-blocker',
  'thiazide-or-thiazide-like-diuretic',
  'beta-blocker',
]

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function latestBloodPressure(profile: CdssPatientProfile): BloodPressure | undefined {
  const value = profile.facts.bloodPressure?.sources?.[0]?.value
  if (typeof value !== 'string') return undefined
  const match = value.match(/^(\d{2,3})\/(\d{2,3})$/)
  if (!match) return undefined
  const systolic = Number(match[1])
  const diastolic = Number(match[2])
  return Number.isFinite(systolic) && Number.isFinite(diastolic)
    ? { systolic, diastolic }
    : undefined
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

function isCurrentMedicationClass(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): boolean {
  return profile.medicationClassContexts?.[classId]?.state === 'confirmed-current'
}

function orderedMedicationEvidence(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): ClinicalEvidence[] {
  return compactEvidence([
    patientEvidence(profile, locale, 'aceArbTherapy', 'ACEI／ARB', 'ACE inhibitor/ARB'),
    patientEvidence(profile, locale, 'ccbTherapy', '鈣離子通道阻斷劑', 'Calcium-channel blocker'),
    patientEvidence(profile, locale, 'thiazideTherapy', 'Thiazide 類利尿劑', 'Thiazide-type diuretic'),
    patientEvidence(profile, locale, 'betaBlockerTherapy', 'β 阻斷劑', 'Beta-blocker'),
    patientEvidence(profile, locale, 'mraTherapy', 'Spironolactone／eplerenone', 'Spironolactone/eplerenone'),
    patientEvidence(profile, locale, 'medicationListOverview', '現行用藥清單', 'Current medication list'),
  ])
}

function hasEstablishedHighRiskCondition(profile: CdssPatientProfile): boolean {
  return Boolean(
    profile.facts.ascvdDiagnosis
    || profile.facts.heartFailureDiagnosis
    || profile.eligibleDiseasePackIds?.includes('dm-poc')
    || profile.eligibleDiseasePackIds?.includes('ckd-poc'),
  )
}

function isSevere(bp: BloodPressure | undefined): boolean {
  return Boolean(bp && (bp.systolic > 180 || bp.diastolic > 120))
}

function bpStage(bp: BloodPressure | undefined): 'below-target' | 'stage-1' | 'stage-2' | undefined {
  if (!bp) return undefined
  if (bp.systolic >= 140 || bp.diastolic >= 90) return 'stage-2'
  if (bp.systolic >= 130 || bp.diastolic >= 80) return 'stage-1'
  return 'below-target'
}

function buildSevereBloodPressureSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const bp = latestBloodPressure(profile)
  if (!isSevere(bp)) return undefined

  return {
    id: 'hypertension-severe-safety',
    domain: 'safety',
    priority: 'high',
    status: 'review',
    overviewEvidenceFactKey: 'bloodPressure',
    title: text(
      locale,
      `血壓 ${bp!.systolic}/${bp!.diastolic} mmHg：先排除高血壓急症`,
      `BP ${bp!.systolic}/${bp!.diastolic} mm Hg: rule out hypertensive emergency first`,
    ),
    recommendation: text(
      locale,
      '立即以正確尺寸袖帶與標準姿勢重測，並同步評估急性神經、心肺、腎臟、視網膜與主動脈損傷。若有急性標的器官損傷或相符症狀，啟動急診／院內緊急處置；若沒有，仍需及時門診重新開始、調整或加強口服治療。',
      'Immediately repeat BP with an appropriately sized cuff and standardized positioning while assessing acute neurologic, cardiopulmonary, kidney, retinal, and aortic injury. If acute target-organ damage or compatible symptoms are present, activate emergency care; if absent, promptly reinstitute, modify, or intensify oral therapy in the outpatient pathway.',
    ),
    rationale: text(
      locale,
      '嚴重血壓數值本身不能區分高血壓急症與無急性器官損傷的嚴重高血壓；處置場域取決於急性標的器官損傷。',
      'A severe BP value alone does not distinguish hypertensive emergency from severe hypertension without acute organ damage; the care setting depends on acute target-organ injury.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'bloodPressure', '最新血壓', 'Latest BP'),
      patientEvidence(profile, locale, 'hypertensionDiagnosis', '高血壓診斷', 'Hypertension diagnosis'),
    ]),
    missingData: [
      text(locale, '立即標準化重測血壓', 'Immediate standardized repeat BP'),
      text(locale, '急性胸痛、呼吸困難、神經症狀、視力改變與寡尿／急性腎損傷評估', 'Assessment for acute chest pain, dyspnea, neurologic symptoms, visual change, and oliguria/acute kidney injury'),
    ],
    nextActions: [
      text(locale, '先重測並完成急性標的器官損傷評估，再決定急診或及時門診路徑。', 'Repeat BP and complete the acute target-organ injury assessment before choosing emergency or prompt outpatient care.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組不會只憑一筆血壓自動標記「高血壓急症」，也不會在急性器官損傷尚未排除前建議快速門診降壓。',
      'The module never labels hypertensive emergency from one BP value alone and does not recommend rapid outpatient lowering before acute target-organ injury is excluded.',
    ),
  }
}

function buildMeasurement(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const bp = latestBloodPressure(profile)
  const sourceCount = profile.facts.bloodPressure?.sources?.length ?? 0
  const freshness = profile.freshnessContexts?.bloodPressure?.state
  const current = freshness === 'current'

  return {
    id: 'hypertension-measurement',
    domain: 'monitoring',
    priority: bp && current ? 'routine' : 'medium',
    status: 'needs-data',
    overviewEvidenceFactKey: 'bloodPressure',
    title: bp
      ? text(
          locale,
          `最新血壓 ${bp.systolic}/${bp.diastolic} mmHg；需以標準化居家平均確認`,
          `Latest BP ${bp.systolic}/${bp.diastolic} mm Hg; confirm with a standardized home average`,
        )
      : text(
          locale,
          '缺少可判讀的近期血壓',
          'No interpretable recent BP is available',
        ),
    recommendation: text(
      locale,
      '先查找既有居家或動態血壓；若沒有，使用經驗證的上臂袖帶式裝置完成台灣 722 居家量測（連續 7 天、早晚各一次、每次至少 2 筆，間隔 1 分鐘），並以平均值判斷控制狀態。',
      'First retrieve existing home or ambulatory BP data. If unavailable, use a validated upper-arm cuff device for standardized home monitoring; the Taiwan 722 protocol uses 7 consecutive days, morning and evening sessions, and at least 2 readings 1 minute apart per session. Base control decisions on the average.',
    ),
    rationale: text(
      locale,
      `${sourceCount > 0 ? `病歷可定位 ${sourceCount} 筆血壓來源，但` : ''}目前 FHIR 資料沒有量測姿勢、休息時間、袖帶尺寸、裝置驗證或居家平均，因此不能把單筆數值當成確診或治療調整依據。`,
      `${sourceCount > 0 ? `${sourceCount} BP source record${sourceCount === 1 ? '' : 's'} can be located, but ` : ''}the FHIR data do not establish positioning, rest time, cuff size, device validation, or a home average, so one value cannot establish diagnosis or drive treatment adjustment.`,
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'bloodPressure', '最新血壓', 'Latest BP'),
    ]),
    missingData: [
      text(locale, '標準化居家血壓平均、量測日期與裝置', 'Standardized home BP average, dates, and device'),
      ...(!bp || !current
        ? [text(locale, '近期標準化血壓', 'Recent standardized BP')]
        : []),
    ],
    nextActions: [
      text(locale, '完成或找回一個 722 週期；若無法居家量測，依可近性安排 ABPM。', 'Complete or retrieve one 722 cycle; if home monitoring is not feasible, arrange ABPM when accessible.'),
      text(locale, '不要使用智慧手錶等無袖帶裝置作為診斷或調藥依據。', 'Do not use a cuffless wearable as the basis for diagnosis or medication adjustment.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '單次門診血壓、量測方法不明的歷史值與無袖帶裝置數值，都不會被自動平均或視為標準化居家血壓。',
      'A single office BP, historical values with unknown technique, and cuffless-device readings are not automatically averaged or treated as standardized home BP.',
    ),
  }
}

function buildControlTarget(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const bp = latestBloodPressure(profile)
  const stage = bpStage(bp)
  const current = profile.freshnessContexts?.bloodPressure?.state === 'current'
  const severe = isSevere(bp)
  const atTarget = stage === 'below-target' && current

  return {
    id: 'hypertension-control-target',
    domain: 'target',
    priority: severe ? 'high' : stage === 'stage-2' ? 'medium' : 'routine',
    status: severe
      ? 'review'
      : !bp || !current
        ? 'needs-data'
        : atTarget
          ? 'no-action'
          : 'review',
    overviewEvidenceFactKey: 'bloodPressure',
    title: bp
      ? atTarget
        ? text(
            locale,
            `最新血壓 ${bp.systolic}/${bp.diastolic} mmHg，低於一般目標 130/80`,
            `Latest BP ${bp.systolic}/${bp.diastolic} mm Hg is below the general 130/80 goal`,
          )
        : text(
            locale,
            `最新血壓 ${bp.systolic}/${bp.diastolic} mmHg，尚不能確認已達 <130/80`,
            `Latest BP ${bp.systolic}/${bp.diastolic} mm Hg does not establish control below 130/80`,
          )
      : text(
          locale,
          '需取得近期標準化血壓以判斷是否達標',
          'A recent standardized BP is needed to assess goal attainment',
        ),
    recommendation: text(
      locale,
      atTarget
        ? '目前這筆數值低於台灣與美國指引的一般成人目標；仍應以標準化居家平均、耐受性與個別情境確認。'
        : '以標準化居家或動態血壓平均確認後，再以一般成人 <130/80 mmHg 為共同決策起點；機構住民、預期壽命有限、明顯衰弱、姿勢性低血壓或懷孕需個別化。',
      atTarget
        ? 'This value is below the general adult goal shared by the Taiwan and US guidelines; confirm with a standardized home average, tolerability, and individual context.'
        : 'Confirm with a standardized home or ambulatory average, then use <130/80 mm Hg as the shared-decision starting point for most adults. Individualize for institutional care, limited life expectancy, substantial frailty, orthostatic hypotension, or pregnancy.',
    ),
    rationale: text(
      locale,
      '兩份主指引的一般成人控制目標皆為 <130/80 mmHg，但治療強度仍需權衡暈厥、跌倒、電解質異常與急性腎損傷風險。',
      'Both primary guidelines use a general adult control goal below 130/80 mm Hg, while treatment intensity still requires balancing syncope, falls, electrolyte abnormalities, and acute kidney injury.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'bloodPressure', '最新血壓', 'Latest BP'),
      patientEvidence(profile, locale, 'age', '年齡', 'Age'),
      patientEvidence(profile, locale, 'ascvdDiagnosis', 'ASCVD', 'ASCVD'),
      patientEvidence(profile, locale, 'heartFailureDiagnosis', '心衰竭', 'Heart failure'),
      patientEvidence(profile, locale, 'ckdDiagnosis', 'CKD', 'CKD'),
    ]),
    missingData: !bp || !current
      ? [text(locale, '近期標準化血壓平均', 'Recent standardized BP average')]
      : !atTarget
        ? [text(locale, '標準化居家血壓平均與低血壓／姿勢性症狀', 'Standardized home BP average and hypotensive/orthostatic symptoms')]
        : [],
    nextActions: [
      atTarget
        ? text(locale, '維持量測與治療耐受性追蹤，不因單筆達標自行停藥。', 'Continue measurement and tolerability follow-up; do not stop therapy because of one at-goal value.')
        : text(locale, '以居家平均、症狀與病人目標共同決定是否調整治療。', 'Use the home average, symptoms, and patient goals to decide whether treatment should change.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '這是一般成人目標，不套用到懷孕急症；也不因單筆低於 130/80 就推定可減藥。',
      'This is a general adult goal, not a pregnancy-emergency target, and one value below 130/80 does not establish that therapy can be reduced.',
    ),
  }
}

function buildTreatmentStrategy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const bp = latestBloodPressure(profile)
  const bpIsCurrent = profile.freshnessContexts?.bloodPressure?.state === 'current'
  const stage = bpIsCurrent ? bpStage(bp) : undefined
  const highRisk = hasEstablishedHighRiskCondition(profile)
  const currentClassCount = FIRST_LINE_CLASS_IDS.filter((classId) => (
    isCurrentMedicationClass(profile, classId)
  )).length
  const anyMedicationData = Boolean(profile.facts.medicationListOverview)
  const isAboveTarget = stage === 'stage-1' || stage === 'stage-2'
  const status: CdssRecommendation['status'] = !bp
    ? 'needs-data'
    : isAboveTarget
      ? 'review'
      : anyMedicationData
        ? 'no-action'
        : 'needs-data'

  const strategy = !bp || !bpIsCurrent
    ? text(
        locale,
        '先取得近期標準化血壓平均並完成實際用藥核對；過期血壓只作為歷史背景，不用來決定目前分期、開始雙藥或加強治療。',
        'Obtain a recent standardized BP average and reconcile actual medication use first. An outdated BP is historical context only and is not used to assign the current stage, start 2 agents, or intensify treatment.',
      )
    : stage === 'stage-2'
    ? text(
        locale,
        '若標準化平均仍為 ≥140/90，核對依從性、禁忌與共病後，通常以兩種不同第一線藥物開始或加強，優先考慮單錠複方；不要合併 ACEI、ARB 或直接 renin inhibitor。',
        'If the standardized average remains ≥140/90, reconcile adherence, contraindications, and comorbidities, then usually initiate or intensify 2 different first-line agents, ideally as a single-pill combination. Do not combine an ACE inhibitor, ARB, or direct renin inhibitor with one another.',
      )
    : stage === 'stage-1' && highRisk
      ? text(
          locale,
          '若標準化平均仍為 130–139/80–89，已知心血管疾病、糖尿病或 CKD 會支持在生活型態介入外評估藥物治療；藥物選擇需依共病、腎功能、血鉀、耐受性與病人偏好。',
          'If the standardized average remains 130–139/80–89, established CVD, diabetes, or CKD supports assessing medication in addition to lifestyle intervention. Choose therapy using comorbidity, kidney function, potassium, tolerability, and patient preference.',
        )
      : stage === 'stage-1'
        ? text(
            locale,
            '先完成心血管風險與生活型態評估。美國指引以 PREVENT 10 年風險 7.5% 作為第一級高血壓立即藥物治療的重要門檻；較低風險者可先進行 3–6 個月生活型態介入後再評估。',
            'Complete cardiovascular-risk and lifestyle assessment first. The US guideline uses a 7.5% PREVENT 10-year risk threshold to guide immediate medication for stage 1 hypertension; lower-risk adults may first receive a 3- to 6-month lifestyle trial.',
          )
        : text(
            locale,
            '維持目前有效且可耐受的治療與生活型態策略，持續以標準化居家血壓監測。',
            'Continue effective, tolerated therapy and lifestyle measures with standardized home BP monitoring.',
          )

  return {
    id: 'hypertension-treatment-strategy',
    domain: 'medication',
    priority: stage === 'stage-2' ? 'medium' : 'routine',
    status: !bp || !bpIsCurrent ? 'needs-data' : status,
    overviewEvidenceFactKey: 'medicationListOverview',
    title: text(
      locale,
      `降壓治療核對：已確認 ${currentClassCount} 類主要降壓藥`,
      `Antihypertensive reconciliation: ${currentClassCount} major class${currentClassCount === 1 ? '' : 'es'} confirmed current`,
    ),
    recommendation: strategy,
    rationale: text(
      locale,
      '生活型態介入適用所有血壓偏高者；是否開始、合併或加強藥物，必須以可靠平均血壓、總心血管風險、共病與現行用藥為基礎。',
      'Lifestyle intervention applies to all adults with elevated BP. Starting, combining, or intensifying medication requires a reliable average BP, total cardiovascular risk, comorbidity, and current medication use.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'bloodPressure', '最新血壓', 'Latest BP'),
      ...orderedMedicationEvidence(profile, locale),
      patientEvidence(profile, locale, 'ascvdDiagnosis', 'ASCVD', 'ASCVD'),
      patientEvidence(profile, locale, 'heartFailureDiagnosis', '心衰竭', 'Heart failure'),
      patientEvidence(profile, locale, 'ckdDiagnosis', 'CKD', 'CKD'),
    ]),
    missingData: [
      ...(!bp || !bpIsCurrent
        ? [text(locale, '近期標準化血壓平均', 'Recent standardized BP average')]
        : []),
      ...(!anyMedicationData
        ? [text(locale, '完整現行用藥、實際服用情形與依從性', 'Complete current medications, actual use, and adherence')]
        : []),
      ...(stage === 'stage-1' && !highRisk
        ? [text(locale, 'PREVENT 10 年心血管風險所需資料與生活型態介入反應', 'Inputs for PREVENT 10-year CVD risk and response to lifestyle intervention')]
        : []),
      ...(isAboveTarget
        ? [text(locale, '副作用、姿勢性低血壓、懷孕可能性與病人偏好', 'Adverse effects, orthostatic hypotension, pregnancy potential, and patient preference')]
        : []),
    ],
    nextActions: [
      text(locale, '先完成實際用藥、依從性與過敏／不耐受核對。', 'First reconcile actual use, adherence, and allergy/intolerance.'),
      text(locale, '同步執行減鈉、健康飲食、體重、運動、酒精、吸菸與壓力管理。', 'Address sodium, healthy eating, weight, physical activity, alcohol, smoking, and stress in parallel.'),
      ...(isAboveTarget
        ? [text(locale, '由臨床人員依標準化平均血壓與共病決定維持、調整或合併治療。', 'Have a clinician decide whether to maintain, adjust, or combine treatment using the standardized average and comorbidities.')]
        : []),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '「未找到」不等於病人未服用；本模組不自動開藥、不計算個別劑量，也不把 β 阻斷劑在台灣與美國指引中的角色視為完全相同。',
      '"Not found" does not prove nonuse. The module does not prescribe or calculate doses, and it does not treat the role of beta-blockers as identical in the Taiwan and US guidelines.',
    ),
  }
}

function buildBaselineEvaluation(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const hasKidneyFunction = Boolean(profile.facts.eGFR || profile.facts.serumCreatinine)
  const hasPotassium = Boolean(profile.facts.potassium)
  const hasGlycemia = Boolean(profile.facts.HbA1c)
  const hasLipids = Boolean(profile.facts.LDL || profile.facts.totalCholesterol)
  const hasAlbuminuria = Boolean(
    profile.facts.urineAlbuminRatioQuantitative
    || profile.facts.urineAlbuminRatio,
  )
  const completedCount = [
    hasKidneyFunction,
    hasPotassium,
    hasGlycemia,
    hasLipids,
    hasAlbuminuria,
  ].filter(Boolean).length
  const missingData = [
    ...(!hasKidneyFunction
      ? [text(locale, 'serum creatinine／eGFR', 'Serum creatinine/eGFR')]
      : []),
    ...(!hasPotassium
      ? [text(locale, '血鉀（並依治療需要取得血鈉、血鈣）', 'Potassium (plus sodium and calcium as treatment requires)')]
      : []),
    ...(!hasGlycemia
      ? [text(locale, '血糖或 HbA1c', 'Glucose or HbA1c')]
      : []),
    ...(!hasLipids
      ? [text(locale, '血脂', 'Lipid profile')]
      : []),
    ...(!hasAlbuminuria
      ? [text(locale, '尿液分析與 UACR', 'Urinalysis and UACR')]
      : []),
  ]

  return {
    id: 'hypertension-baseline-evaluation',
    domain: 'care-gap',
    priority: missingData.length > 0 ? 'medium' : 'routine',
    status: missingData.length > 0 ? 'needs-data' : 'no-action',
    overviewEvidenceFactKey: hasKidneyFunction ? 'eGFR' : 'hypertensionDiagnosis',
    title: text(
      locale,
      `高血壓基礎評估：${completedCount}/5 類關鍵資料可判讀`,
      `Hypertension baseline evaluation: ${completedCount}/5 key data groups evaluable`,
    ),
    recommendation: text(
      locale,
      missingData.length > 0
        ? '先查找既有結果，再補足會影響心血管風險、次發性高血壓、器官損傷或藥物選擇的缺項；新診斷或未控制高血壓仍需完整病史、理學檢查、尿液分析與 12 導程 ECG。'
        : '目前可判讀的腎功能、血鉀、血糖、血脂與白蛋白尿資料已齊；仍需核對完整病史、理學檢查、尿液分析與 12 導程 ECG。',
      missingData.length > 0
        ? 'Retrieve existing results before ordering missing data that affect cardiovascular risk, secondary hypertension, organ damage, or medication choice. New or uncontrolled hypertension still requires a complete history, examination, urinalysis, and 12-lead ECG.'
        : 'Kidney function, potassium, glycemia, lipids, and albuminuria are currently evaluable; still verify the complete history, examination, urinalysis, and 12-lead ECG.',
    ),
    rationale: text(
      locale,
      '基礎評估用來發現共病、次發性原因與高血壓媒介的器官損傷，並避免在腎功能或電解質未知時調整治療。',
      'Baseline evaluation identifies comorbidity, secondary causes, and hypertension-mediated organ damage and avoids treatment changes when kidney function or electrolytes are unknown.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      patientEvidence(profile, locale, 'serumCreatinine', 'Creatinine', 'Creatinine'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      patientEvidence(profile, locale, 'HbA1c', 'HbA1c', 'HbA1c'),
      patientEvidence(profile, locale, 'LDL', 'LDL-C', 'LDL-C'),
      patientEvidence(profile, locale, 'totalCholesterol', '總膽固醇', 'Total cholesterol'),
      patientEvidence(profile, locale, 'urineAlbuminOverview', '尿白蛋白', 'Urine albumin'),
    ]),
    missingData,
    nextActions: [
      text(locale, '先搜尋完整病歷與跨院資料，僅補做真正缺少或已過期且會改變決策的項目。', 'Search the complete and cross-facility chart first; obtain only truly missing or outdated items that would change a decision.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本卡只盤點目前 FHIR 可判讀資料；「未顯示」不等於從未完成，ECG 與尿液分析也未因資料類型缺失而自動判定未做。',
      'This card inventories only evaluable FHIR data. "Not shown" does not mean never completed, and ECG or urinalysis is not automatically classified as undone when its data type is unavailable.',
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

export const HYPERTENSION_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'hypertension-cdss',
  diseaseCode: 'HTN',
  version: '0.1.0-poc',
  // Health Bank exports rarely contain enough longitudinal BP measurements for
  // reliable patient-specific guidance. Keep the implementation available for
  // future data sources, but hide it from the disease switcher for now.
  enabled: false,
  label: {
    zh: '高血壓',
    en: 'Hypertension',
  },
  applies(profile) {
    return profile.eligibleDiseasePackIds?.includes('hypertension-poc') === true
  },
  build({ profile, locale }) {
    const recommendations = [
      buildSevereBloodPressureSafety(profile, locale),
      buildMeasurement(profile, locale),
      buildControlTarget(profile, locale),
      buildTreatmentStrategy(profile, locale),
      buildBaselineEvaluation(profile, locale),
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
        'taiwan-hypertension-2022',
        'aha-acc-hypertension-2025',
      ],
    })
    const highPriorityCount = enriched.recommendations.filter(
      (item) => item.priority === 'high',
    ).length
    const needsDataCount = enriched.recommendations.filter(
      (item) => item.status === 'needs-data',
    ).length

    return {
      title: text(locale, '高血壓個人化照護指引', 'Personalized hypertension care guidance'),
      summary: text(
        locale,
        `本次依病歷產生 ${decisions.length} 項高血壓決策提示：${highPriorityCount} 項優先處理、${needsDataCount} 項需先補齊或查找資料。`,
        `This run generated ${decisions.length} hypertension decision prompts: ${highPriorityCount} high priority and ${needsDataCount} requiring data retrieval or completion.`,
      ),
      packId: 'hypertension-cdss',
      packVersion: '0.1.0-poc',
      knowledgePacks: enriched.knowledgePacks,
      recommendations: enriched.recommendations,
      automatedChecks: automated.map(toAutomatedCheck),
      notEvaluated: [
        text(
          locale,
          '本版尚未計算 PREVENT 10 年心血管風險；第一級高血壓若沒有已知 CVD、糖尿病或 CKD，藥物門檻需補齊風險資料。',
          'This version does not yet calculate PREVENT 10-year CVD risk; medication thresholds for stage 1 hypertension without known CVD, diabetes, or CKD require the risk inputs.',
        ),
        text(
          locale,
          '懷孕／備孕、姿勢性低血壓、明顯衰弱、次發性與抗藥性高血壓需使用專屬評估，不由一般成人路徑自動處理。',
          'Pregnancy/planning pregnancy, orthostatic hypotension, substantial frailty, and secondary or resistant hypertension require dedicated assessment and are not automated by the general adult pathway.',
        ),
        text(
          locale,
          '本版不寫回病歷、不開立醫囑，也不計算個別藥物劑量。',
          'This version does not write to the chart, place orders, or calculate individual medication doses.',
        ),
      ],
      disclaimer: text(
        locale,
        'HTN CDSS POC｜依 2022 台灣 TSOC／THS 與 2025 AHA／ACC 成人高血壓指引產生唯讀決策支援；執行前仍需核對標準化平均血壓、完整病歷、院內流程與病人目標。',
        'HTN CDSS POC | Read-only decision support based on the 2022 Taiwan TSOC/THS and 2025 AHA/ACC adult hypertension guidelines. Verify standardized average BP, the complete chart, institutional workflow, and patient goals before acting.',
      ),
    }
  },
}
