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

type LipidRiskContext = {
  kind: 'ascvd' | 'severe-ldl' | 'diabetes-or-ckd' | 'primary-risk-needed'
  ldlTarget?: number
  nonHdlTarget?: number
  treatmentIndicated: boolean
}

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function numberFromFact(
  profile: CdssPatientProfile,
  key: string,
): number | undefined {
  const value = profile.facts[key]?.numericValue
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isCurrent(profile: CdssPatientProfile, key: string): boolean {
  const context = profile.freshnessContexts?.[key]
  return context ? context.state === 'current' : Boolean(profile.facts[key])
}

function medicationClassState(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): CdssMedicationClassState {
  return profile.medicationClassContexts?.[classId]?.state ?? 'not-found'
}

function isConfirmedCurrent(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): boolean {
  return medicationClassState(profile, classId) === 'confirmed-current'
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

function lipidRiskContext(profile: CdssPatientProfile): LipidRiskContext {
  const ldl = numberFromFact(profile, 'LDL')
  if (profile.facts.ascvdDiagnosis) {
    return {
      kind: 'ascvd',
      ldlTarget: 70,
      nonHdlTarget: 100,
      treatmentIndicated: true,
    }
  }
  if (ldl !== undefined && ldl >= 190) {
    return {
      kind: 'severe-ldl',
      ldlTarget: 100,
      nonHdlTarget: 130,
      treatmentIndicated: true,
    }
  }
  if (
    profile.eligibleDiseasePackIds?.includes('dm-poc')
    || profile.eligibleDiseasePackIds?.includes('ckd-poc')
  ) {
    return {
      kind: 'diabetes-or-ckd',
      ldlTarget: 100,
      nonHdlTarget: 130,
      treatmentIndicated: true,
    }
  }
  return {
    kind: 'primary-risk-needed',
    treatmentIndicated: false,
  }
}

function buildSevereTriglycerideSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const triglycerides = numberFromFact(profile, 'triglycerides')
  if (triglycerides === undefined || triglycerides < 500) return undefined

  const verySevere = triglycerides >= 1000
  const current = isCurrent(profile, 'triglycerides')
  return {
    id: 'dyslipidemia-severe-triglycerides',
    domain: 'safety',
    priority: verySevere ? 'high' : 'medium',
    status: current ? 'review' : 'needs-data',
    overviewEvidenceFactKey: 'triglycerides',
    title: text(
      locale,
      `三酸甘油酯 ${triglycerides} mg/dL：${verySevere ? '優先降低胰臟炎風險' : '確認空腹值與次發性原因'}`,
      `Triglycerides ${triglycerides} mg/dL: ${verySevere ? 'prioritize pancreatitis-risk reduction' : 'confirm fasting level and secondary causes'}`,
    ),
    recommendation: text(
      locale,
      verySevere
        ? '立即確認是否有持續上腹痛、噁心或嘔吐等急性胰臟炎表現；同步安排空腹複驗、極低脂飲食與酒精停用，並由臨床人員依糖尿病控制、甲狀腺、腎肝功能、懷孕、藥物與家族性因素評估 TG 降低治療。'
        : '先確認空腹 TG 與持續性，並檢視酒精、精製醣、糖尿病控制、甲狀腺、腎肝功能、懷孕與會升高 TG 的藥物；若有腹痛等胰臟炎症狀，不等待門診複驗。',
      verySevere
        ? 'Immediately assess persistent upper-abdominal pain, nausea, or vomiting for acute pancreatitis. In parallel, obtain a fasting repeat, institute a very-low-fat diet and alcohol abstinence, and have a clinician assess triglyceride-lowering therapy using glycemic control, thyroid, kidney/liver function, pregnancy, medications, and familial causes.'
        : 'Confirm a fasting triglyceride level and persistence, then review alcohol, refined carbohydrates, glycemic control, thyroid, kidney/liver function, pregnancy, and triglyceride-raising medications. Do not wait for an outpatient repeat if pancreatitis symptoms are present.',
    ),
    rationale: text(
      locale,
      'TG ≥500 mg/dL 需要辨識胰臟炎風險與次發性原因；TG ≥1000 mg/dL 時，降低胰臟炎風險優先於單純 ASCVD 風險調整。',
      'Triglycerides ≥500 mg/dL require evaluation for pancreatitis risk and secondary causes. At ≥1000 mg/dL, pancreatitis-risk reduction takes priority over ASCVD-risk modification alone.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'triglycerides', '三酸甘油酯', 'Triglycerides'),
      patientEvidence(profile, locale, 'HbA1c', 'HbA1c', 'HbA1c'),
      patientEvidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      patientEvidence(profile, locale, 'fibrateTherapy', 'Fibrate', 'Fibrate'),
      patientEvidence(profile, locale, 'prescriptionOmega3Therapy', '處方 omega-3', 'Prescription omega-3'),
    ]),
    missingData: [
      ...(!current
        ? [text(locale, '近期空腹三酸甘油酯', 'Recent fasting triglycerides')]
        : []),
      text(locale, '胰臟炎症狀與過去病史', 'Pancreatitis symptoms and prior history'),
      text(locale, '酒精、飲食、血糖、TSH、肝腎功能、懷孕可能性與相關藥物', 'Alcohol, diet, glycemia, TSH, liver/kidney function, pregnancy potential, and relevant medications'),
    ],
    nextActions: [
      text(locale, '有持續上腹痛、嘔吐或全身不適時，立即依急性胰臟炎路徑評估。', 'If persistent upper-abdominal pain, vomiting, or systemic illness is present, immediately evaluate through the acute-pancreatitis pathway.'),
      text(locale, '確認空腹複驗與次發性原因後，再決定飲食與藥物治療。', 'After confirming a fasting repeat and secondary causes, decide on dietary and pharmacologic treatment.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組不會只憑一筆非空腹 TG 診斷家族性疾病，也不會把一般市售魚油視為處方 TG 降低治療。',
      'The module does not diagnose a familial disorder from one nonfasting triglyceride value and does not treat over-the-counter fish oil as prescription triglyceride-lowering therapy.',
    ),
  }
}

function buildSevereLdlReview(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const ldl = numberFromFact(profile, 'LDL')
  if (ldl === undefined || ldl < 190) return undefined

  const current = isCurrent(profile, 'LDL')
  return {
    id: 'dyslipidemia-severe-ldl',
    domain: 'diagnosis',
    priority: 'high',
    status: current ? 'actionable' : 'needs-data',
    overviewEvidenceFactKey: 'LDL',
    title: text(
      locale,
      `LDL-C ${ldl} mg/dL：確認嚴重高膽固醇血症與家族性風險`,
      `LDL-C ${ldl} mg/dL: confirm severe hypercholesterolemia and familial risk`,
    ),
    recommendation: text(
      locale,
      '確認近期 LDL-C 與治療前數值，排除甲狀腺低下、腎病症候群、膽汁鬱積與相關藥物；並取得早發 ASCVD 家族史、親屬膽固醇與理學表徵，以臨床準則評估家族性高膽固醇血症及家族篩檢。',
      'Confirm the recent and pretreatment LDL-C, exclude hypothyroidism, nephrotic syndrome, cholestasis, and relevant medications, and obtain premature-ASCVD family history, relatives’ cholesterol results, and physical findings to assess familial hypercholesterolemia and cascade screening with a clinical framework.',
    ),
    rationale: text(
      locale,
      'LDL-C ≥190 mg/dL 本身屬高風險治療路徑，但不等同已確診家族性高膽固醇血症。',
      'LDL-C ≥190 mg/dL enters a high-risk treatment pathway but does not by itself establish familial hypercholesterolemia.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'LDL', 'LDL-C', 'LDL-C'),
      patientEvidence(profile, locale, 'hyperlipidemiaDiagnosis', '血脂診斷', 'Lipid diagnosis'),
      patientEvidence(profile, locale, 'statinTherapy', 'Statin', 'Statin'),
      patientEvidence(profile, locale, 'ezetimibeTherapy', 'Ezetimibe', 'Ezetimibe'),
    ]),
    missingData: [
      ...(!current
        ? [text(locale, '近期 LDL-C', 'Recent LDL-C')]
        : []),
      text(locale, '治療前 LDL-C 與既往反應', 'Pretreatment LDL-C and prior response'),
      text(locale, '早發 ASCVD／高膽固醇家族史與次發性原因', 'Family history of premature ASCVD/high cholesterol and secondary causes'),
    ],
    nextActions: [
      text(locale, '先核對完整用藥、依從性與治療前血脂，再由臨床人員啟動最大耐受 LDL 降低策略。', 'First reconcile complete medications, adherence, and pretreatment lipids, then have a clinician initiate a maximally tolerated LDL-lowering strategy.'),
      text(locale, '符合臨床疑慮時轉介脂質專科並討論一等親級聯篩檢。', 'When clinical suspicion is present, refer for lipid expertise and discuss first-degree-relative cascade screening.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '單筆 LDL-C ≥190 mg/dL 會啟動確認與治療檢視，但不會自動標記家族性高膽固醇血症或直接產生個別藥物劑量。',
      'One LDL-C ≥190 mg/dL activates confirmation and treatment review but does not automatically label familial hypercholesterolemia or generate an individual medication dose.',
    ),
  }
}

function buildRiskAndTarget(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const context = lipidRiskContext(profile)
  const ldl = numberFromFact(profile, 'LDL')
  const ldlCurrent = ldl !== undefined && isCurrent(profile, 'LDL')
  const aboveTarget = (
    ldlCurrent
    && context.ldlTarget !== undefined
    && ldl >= context.ldlTarget
  )
  const targetKnown = context.ldlTarget !== undefined
  const atBaseTarget = (
    ldlCurrent
    && context.ldlTarget !== undefined
    && ldl < context.ldlTarget
  )
  const ascvdNeedsVeryHighRiskReview = (
    context.kind === 'ascvd'
    && ldlCurrent
    && ldl >= 55
  )

  const title = context.kind === 'ascvd'
    ? text(
        locale,
        `已知 ASCVD：LDL-C 目標至少 <70 mg/dL${ldlCurrent ? `；目前 ${ldl}` : ''}`,
        `Established ASCVD: LDL-C goal at least <70 mg/dL${ldlCurrent ? `; current ${ldl}` : ''}`,
      )
    : context.kind === 'severe-ldl'
      ? text(locale, 'LDL-C ≥190 mg/dL：高風險路徑目標 <100 mg/dL', 'LDL-C ≥190 mg/dL: high-risk pathway goal <100 mg/dL')
      : context.kind === 'diabetes-or-ckd'
        ? text(locale, '糖尿病／CKD 高風險路徑：先以 LDL-C <100 mg/dL 核對', 'Diabetes/CKD high-risk pathway: first assess LDL-C <100 mg/dL')
        : text(locale, '需完成初級預防風險分層後設定 LDL-C 目標', 'Complete primary-prevention risk stratification before setting the LDL-C goal')

  return {
    id: 'dyslipidemia-risk-and-target',
    domain: 'target',
    priority: context.kind === 'ascvd' || aboveTarget ? 'high' : 'medium',
    status: !ldlCurrent || !targetKnown
      ? 'needs-data'
      : aboveTarget || ascvdNeedsVeryHighRiskReview
        ? 'review'
        : atBaseTarget
          ? 'no-action'
          : 'needs-data',
    overviewEvidenceFactKey: 'LDL',
    title,
    recommendation: context.kind === 'ascvd'
      ? text(
          locale,
          '至少以 LDL-C <70 mg/dL 核對；若有近期 ACS／MI、多次事件、多血管床疾病或其他極高風險條件，應進一步評估 <55 mg/dL。不要只靠診斷碼推定極高風險。',
          'Assess at least an LDL-C goal <70 mg/dL. If recent ACS/MI, multiple events, polyvascular disease, or another very-high-risk condition is confirmed, further assess a <55 mg/dL goal. Do not infer very high risk from a diagnosis code alone.',
        )
      : context.kind === 'severe-ldl' || context.kind === 'diabetes-or-ckd'
        ? text(
            locale,
            '台灣初級預防指引將此情境列為高風險並以 LDL-C <100 mg/dL 為目標；仍需核對透析、年齡、治療耐受性與完整共病。',
            'The Taiwan primary-prevention guideline classifies this context as high risk with an LDL-C goal <100 mg/dL; still verify dialysis status, age, treatment tolerance, and complete comorbidity.',
          )
        : text(
            locale,
            '取得 PREVENT 10 年／適用時 30 年風險所需資料，並整合家族史、吸菸、血壓、糖尿病／CKD、Lp(a)、慢性發炎與女性特有風險；治療仍不確定時才選擇性使用 CAC 重新分層。',
            'Obtain inputs for PREVENT 10-year and, when applicable, 30-year risk, then integrate family history, smoking, blood pressure, diabetes/CKD, Lp(a), chronic inflammation, and female-specific risk. Use CAC selectively only when the treatment decision remains uncertain.',
          ),
    rationale: text(
      locale,
      'LDL-C 目標與治療強度取決於 ASCVD 事件風險，而不是同一個「正常值」套用所有人；non-HDL-C 可作為 LDL-C 達標後的次要目標。',
      'LDL-C goals and treatment intensity depend on ASCVD event risk rather than one universal “normal” value; non-HDL-C can serve as a secondary goal after LDL-C.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'LDL', 'LDL-C', 'LDL-C'),
      patientEvidence(profile, locale, 'nonHDL', 'non-HDL-C', 'non-HDL-C'),
      patientEvidence(profile, locale, 'ascvdDiagnosis', 'ASCVD', 'ASCVD'),
      patientEvidence(profile, locale, 'hyperlipidemiaDiagnosis', '血脂診斷', 'Lipid diagnosis'),
      patientEvidence(profile, locale, 'age', '年齡', 'Age'),
      patientEvidence(profile, locale, 'bloodPressure', '血壓', 'Blood pressure'),
      patientEvidence(profile, locale, 'HbA1c', 'HbA1c', 'HbA1c'),
      patientEvidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
    ]),
    missingData: [
      ...(!ldlCurrent
        ? [text(locale, '近期 LDL-C 與採檢日期', 'Recent LDL-C and collection date')]
        : []),
      ...(context.kind === 'primary-risk-needed'
        ? [text(locale, 'PREVENT 風險所需資料、吸菸與早發 ASCVD 家族史', 'PREVENT risk inputs, smoking, and family history of premature ASCVD')]
        : []),
      ...(context.kind === 'ascvd'
        ? [text(locale, '近期／多次 ASCVD 事件與多血管床疾病，以確認是否屬極高風險', 'Recent/multiple ASCVD events and polyvascular disease to determine very-high-risk status')]
        : []),
      ...(context.kind === 'diabetes-or-ckd'
        ? [text(locale, '透析狀態、CKD 分期與完整共病', 'Dialysis status, CKD stage, and complete comorbidity')]
        : []),
    ],
    nextActions: [
      targetKnown
        ? text(
            locale,
            `以近期 LDL-C 核對 <${context.ldlTarget} mg/dL；有同日 TC 與 HDL-C 時同步核對 non-HDL-C <${context.nonHdlTarget} mg/dL。`,
            `Use a recent LDL-C to assess <${context.ldlTarget} mg/dL; when same-day total and HDL cholesterol are available, also assess non-HDL-C <${context.nonHdlTarget} mg/dL.`,
          )
        : text(locale, '完成風險計算與增強因子核對後共同決策治療門檻與強度。', 'After risk calculation and risk-enhancer review, use shared decision-making for the treatment threshold and intensity.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組不自行計算缺少輸入的 PREVENT 分數，也不把 ASCVD 診斷碼自動等同極高風險。',
      'The module does not calculate PREVENT with missing inputs and does not automatically equate an ASCVD diagnosis code with very-high-risk status.',
    ),
  }
}

function buildLipidLoweringTherapy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const context = lipidRiskContext(profile)
  const ldl = numberFromFact(profile, 'LDL')
  const ldlCurrent = ldl !== undefined && isCurrent(profile, 'LDL')
  const statinState = medicationClassState(profile, 'statin')
  const statinConfirmed = statinState === 'confirmed-current'
  const statinAllergy = profile.medicationClassContexts?.statin?.allergyState === 'documented'
  const medicationDataAvailable = Boolean(profile.facts.medicationListOverview)
  const targetMissed = (
    ldlCurrent
    && context.ldlTarget !== undefined
    && ldl >= context.ldlTarget
  )
  const adjunctCount = ([
    'ezetimibe',
    'pcsk9-inhibitor',
    'bempedoic-acid',
  ] as const).filter((classId) => isConfirmedCurrent(profile, classId)).length

  const status: CdssRecommendation['status'] = !medicationDataAvailable
    && statinState === 'not-found'
    ? 'needs-data'
    : statinAllergy
      ? 'review'
      : context.treatmentIndicated && statinState === 'not-found'
        ? 'actionable'
        : statinState === 'active-order-unconfirmed'
          || statinState === 'on-hold'
          || statinState === 'historical-record-current-status-unknown'
          ? 'review'
          : !context.treatmentIndicated
            ? 'needs-data'
            : statinConfirmed && targetMissed
              ? 'review'
              : statinConfirmed && ldlCurrent
                ? 'no-action'
                : 'needs-data'

  const strategy = statinAllergy
    ? text(
        locale,
        '先重建症狀、時間關係、CK／肝功能與再挑戰紀錄，確認是過敏、部分不耐受或完全不耐受；仍以最大可耐受 statin 為起點，不能耐受時再依風險與實證選擇非 statin。',
        'Reconstruct symptoms, timing, CK/liver tests, and rechallenge history to distinguish allergy, partial intolerance, and complete intolerance. Start with the maximally tolerated statin when possible; if not tolerated, select nonstatin therapy according to risk and evidence.',
      )
    : context.treatmentIndicated && statinState === 'not-found'
      ? text(
          locale,
          '病歷風險支持啟動 LDL 降低治療檢視；先核對完整跨院用藥、既往 statin 反應、交互作用、懷孕可能性與病人偏好，再由臨床人員選擇最大耐受強度。',
          'The documented risk supports an LDL-lowering treatment review. First reconcile complete cross-facility medication use, prior statin response, interactions, pregnancy potential, and patient preference, then have a clinician select the maximally tolerated intensity.',
        )
      : statinConfirmed && targetMissed
        ? text(
            locale,
            '先確認依從性、強度與預期 LDL 降幅；若最大耐受 statin 仍未達個人目標，依風險、預期降幅、共病、交互作用、給付與偏好評估加入 ezetimibe，再視情境評估 PCSK9 抑制劑或 bempedoic acid。',
            'First confirm adherence, intensity, and expected LDL reduction. If maximally tolerated statin therapy does not achieve the individual goal, assess adding ezetimibe and, depending on risk, expected reduction, comorbidity, interactions, coverage, and preference, a PCSK9 inhibitor or bempedoic acid.',
          )
        : !context.treatmentIndicated
          ? text(
              locale,
              '目前資料不足以決定初級預防是否開始藥物；先完成 PREVENT 風險與增強因子，再共同決策生活型態單獨介入或加入 statin。',
              'Current data are insufficient to decide whether to start primary-prevention medication. Complete PREVENT risk and risk-enhancer review, then use shared decision-making for lifestyle alone or statin therapy.',
            )
          : text(
              locale,
              '維持已確認且可耐受的 LDL 降低治療，持續核對依從性、交互作用、症狀與達標情形；不要因單筆達標自行停藥。',
              'Continue confirmed, tolerated LDL-lowering therapy while reviewing adherence, interactions, symptoms, and goal attainment. Do not stop treatment because of one at-goal value.',
            )

  return {
    id: 'dyslipidemia-lipid-lowering-therapy',
    domain: 'medication',
    priority: context.kind === 'ascvd' || targetMissed ? 'high' : 'medium',
    status,
    overviewEvidenceFactKey: 'statinTherapy',
    title: text(
      locale,
      `降脂治療核對：statin ${statinState === 'confirmed-current' ? '已確認使用' : statinState === 'not-found' ? '現有資料未見' : '狀態待核對'}；非 statin ${adjunctCount} 類`,
      `Lipid-lowering reconciliation: statin ${statinState === 'confirmed-current' ? 'confirmed current' : statinState === 'not-found' ? 'not found in available data' : 'status needs review'}; ${adjunctCount} nonstatin class${adjunctCount === 1 ? '' : 'es'}`,
    ),
    recommendation: strategy,
    rationale: text(
      locale,
      'Statin 是多數 LDL 降低路徑的基礎；是否加入非 statin 必須建立在個人風險、最大耐受治療、依從性與實際未達標之上。',
      'Statins are the foundation of most LDL-lowering pathways. Adding a nonstatin requires individual risk, maximally tolerated therapy, adherence, and documented failure to reach the goal.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'LDL', 'LDL-C', 'LDL-C'),
      patientEvidence(profile, locale, 'statinTherapy', 'Statin', 'Statin'),
      patientEvidence(profile, locale, 'statinAllergy', 'Statin 過敏／不耐受', 'Statin allergy/intolerance'),
      patientEvidence(profile, locale, 'ezetimibeTherapy', 'Ezetimibe', 'Ezetimibe'),
      patientEvidence(profile, locale, 'pcsk9Therapy', 'PCSK9 抑制劑', 'PCSK9 inhibitor'),
      patientEvidence(profile, locale, 'bempedoicAcidTherapy', 'Bempedoic acid', 'Bempedoic acid'),
      patientEvidence(profile, locale, 'medicationListOverview', '現行用藥', 'Current medications'),
    ]),
    missingData: [
      ...(!medicationDataAvailable
        ? [text(locale, '完整現行與跨院降脂用藥、實際服用與依從性', 'Complete current and cross-facility lipid-lowering medications, actual use, and adherence')]
        : []),
      ...(!ldlCurrent
        ? [text(locale, '近期 LDL-C 與採檢日期', 'Recent LDL-C and collection date')]
        : []),
      ...(!context.treatmentIndicated
        ? [text(locale, 'PREVENT 風險、風險增強因子與病人偏好', 'PREVENT risk, risk enhancers, and patient preference')]
        : []),
      text(locale, '治療前 LDL-C、既往副作用、交互作用與懷孕可能性', 'Pretreatment LDL-C, prior adverse effects, interactions, and pregnancy potential'),
    ],
    nextActions: [
      text(locale, '先完成藥物核對與共同決策，不把「未找到」直接當成未治療。', 'Complete medication reconciliation and shared decision-making first; do not treat “not found” as proof of no treatment.'),
      ...(targetMissed
        ? [text(locale, '確認最大耐受 statin 與依從性後，才依序評估非 statin 加成。', 'Confirm maximally tolerated statin therapy and adherence before sequential nonstatin intensification.')]
        : []),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組不開立藥物、不計算個別劑量，也不把過敏欄位中的「statin」直接等同已完成標準化不耐受評估。',
      'The module does not prescribe, calculate individual doses, or equate a “statin” allergy entry with a completed standardized intolerance evaluation.',
    ),
  }
}

function buildMonitoringAndMarkers(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const requiredKeys = ['LDL', 'HDL', 'triglycerides', 'totalCholesterol'] as const
  const currentCount = requiredKeys.filter((key) => (
    profile.facts[key] && isCurrent(profile, key)
  )).length
  const missingCore = requiredKeys.filter((key) => (
    !profile.facts[key] || !isCurrent(profile, key)
  ))
  const hasLipoproteinA = Boolean(profile.facts.lipoproteinA)
  const apoBUseful = (
    Boolean(profile.facts.ascvdDiagnosis)
    || Boolean(profile.eligibleDiseasePackIds?.includes('dm-poc'))
    || (numberFromFact(profile, 'triglycerides') ?? 0) > 200
    || (numberFromFact(profile, 'LDL') ?? Number.POSITIVE_INFINITY) < 70
  )
  const hasApoB = Boolean(profile.facts.apolipoproteinB)
  const missingData = [
    ...missingCore.map((key) => {
      const labels = {
        LDL: text(locale, '近期 LDL-C', 'Recent LDL-C'),
        HDL: text(locale, '近期 HDL-C', 'Recent HDL-C'),
        triglycerides: text(locale, '近期三酸甘油酯', 'Recent triglycerides'),
        totalCholesterol: text(locale, '近期總膽固醇', 'Recent total cholesterol'),
      }
      return labels[key]
    }),
    ...(!hasLipoproteinA
      ? [text(locale, '成年後至少一次 Lp(a)', 'At least one adult Lp(a) measurement')]
      : []),
    ...(apoBUseful && !hasApoB
      ? [text(locale, '選擇性 ApoB（ASCVD／高風險、TG >200、糖尿病或低 LDL-C 時）', 'Selective ApoB for ASCVD/high risk, triglycerides >200, diabetes, or low achieved LDL-C')]
      : []),
  ]

  return {
    id: 'dyslipidemia-monitoring-and-markers',
    domain: 'monitoring',
    priority: missingCore.includes('LDL') ? 'medium' : 'routine',
    status: missingData.length > 0 ? 'needs-data' : 'no-action',
    overviewEvidenceFactKey: 'LDL',
    title: text(
      locale,
      `血脂監測：核心血脂 ${currentCount}/4 項近期可判讀`,
      `Lipid monitoring: ${currentCount}/4 core measures are current and evaluable`,
    ),
    recommendation: text(
      locale,
      '先查找既有同日完整血脂；開始或調整降脂治療後 4–12 週複驗以評估反應與依從性，之後依風險與穩定度追蹤。成年後至少量一次 Lp(a)；ApoB 用於特定殘餘風險情境，不需對每位病人例行重複。',
      'First retrieve an existing same-day complete lipid profile. Recheck 4–12 weeks after starting or changing lipid-lowering therapy to assess response and adherence, then monitor according to risk and stability. Measure Lp(a) at least once in adulthood; use ApoB selectively for residual-risk contexts rather than routinely repeating it for everyone.',
    ),
    rationale: text(
      locale,
      'LDL-C 是主要治療指標；同日 TC 與 HDL-C 可計算 non-HDL-C，TG、Lp(a) 與選擇性 ApoB 補充風險與安全判讀。',
      'LDL-C is the primary treatment measure. Same-day total and HDL cholesterol permit non-HDL-C calculation, while triglycerides, Lp(a), and selective ApoB add risk and safety context.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'LDL', 'LDL-C', 'LDL-C'),
      patientEvidence(profile, locale, 'HDL', 'HDL-C', 'HDL-C'),
      patientEvidence(profile, locale, 'triglycerides', '三酸甘油酯', 'Triglycerides'),
      patientEvidence(profile, locale, 'totalCholesterol', '總膽固醇', 'Total cholesterol'),
      patientEvidence(profile, locale, 'nonHDL', 'non-HDL-C', 'non-HDL-C'),
      patientEvidence(profile, locale, 'lipoproteinA', 'Lp(a)', 'Lp(a)'),
      patientEvidence(profile, locale, 'apolipoproteinB', 'ApoB', 'ApoB'),
    ]),
    missingData,
    nextActions: [
      text(locale, '先搜尋完整病歷與跨院檢驗，只補做真正缺少或已過期且會改變決策的項目。', 'Search the complete and cross-facility chart first, and obtain only truly missing or outdated measures that would change a decision.'),
      text(locale, '若近期剛開始或調整治療，安排 4–12 週反應與依從性檢查。', 'If therapy was recently started or changed, arrange a 4–12-week response and adherence check.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '不同日期的 TC 與 HDL-C 不會被合併計算 non-HDL-C；Lp(a) 的 mg/dL 與 nmol/L 也不會互相換算。',
      'Total and HDL cholesterol from different dates are not combined to calculate non-HDL-C, and Lp(a) values in mg/dL and nmol/L are not interconverted.',
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

export const HYPERLIPIDEMIA_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'hyperlipidemia-cdss',
  diseaseCode: 'LIPID',
  version: '0.1.0-poc',
  enabled: true,
  label: {
    zh: '高血脂',
    en: 'Dyslipidemia',
  },
  applies(profile) {
    return profile.eligibleDiseasePackIds?.includes('hyperlipidemia-poc') === true
  },
  build({ profile, locale }) {
    const recommendations = [
      buildSevereTriglycerideSafety(profile, locale),
      buildSevereLdlReview(profile, locale),
      buildRiskAndTarget(profile, locale),
      buildLipidLoweringTherapy(profile, locale),
      buildMonitoringAndMarkers(profile, locale),
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
        'aha-acc-dyslipidemia-2026',
        'taiwan-lipid-2022',
      ],
    })
    const highPriorityCount = enriched.recommendations.filter(
      (item) => item.priority === 'high',
    ).length
    const needsDataCount = enriched.recommendations.filter(
      (item) => item.status === 'needs-data',
    ).length

    return {
      title: text(locale, '高血脂個人化照護指引', 'Personalized dyslipidemia care guidance'),
      summary: text(
        locale,
        `本次依病歷產生 ${decisions.length} 項血脂決策提示：${highPriorityCount} 項優先處理、${needsDataCount} 項需先補齊或查找資料。`,
        `This run generated ${decisions.length} lipid decision prompts: ${highPriorityCount} high priority and ${needsDataCount} requiring data retrieval or completion.`,
      ),
      packId: 'hyperlipidemia-cdss',
      packVersion: '0.1.0-poc',
      knowledgePacks: enriched.knowledgePacks,
      recommendations: enriched.recommendations,
      automatedChecks: automated.map(toAutomatedCheck),
      notEvaluated: [
        text(
          locale,
          '本版不自行計算 PREVENT 10／30 年風險；吸菸、家族史、族群、慢性發炎、生殖史與 CAC 等資料需由臨床人員補齊或核對。',
          'This version does not calculate PREVENT 10- or 30-year risk. Smoking, family history, ancestry, chronic inflammation, reproductive history, and CAC require clinician retrieval or review.',
        ),
        text(
          locale,
          '家族性高膽固醇血症、妊娠／備孕、兒童青少年、透析與複雜 statin 不耐受需使用專屬評估。',
          'Familial hypercholesterolemia, pregnancy/planning pregnancy, children and adolescents, dialysis, and complex statin intolerance require dedicated assessment.',
        ),
        text(
          locale,
          '本版不寫回病歷、不開立醫囑、不計算個別藥物劑量，也不判定健保給付。',
          'This version does not write to the chart, place orders, calculate individual medication doses, or determine National Health Insurance coverage.',
        ),
      ],
      disclaimer: text(
        locale,
        'Lipid CDSS POC｜依 2022 台灣血脂指引與 2026 ACC／AHA 血脂異常指引產生唯讀決策支援；執行前仍需核對完整病歷、實際用藥、院內流程與病人目標。',
        'Lipid CDSS POC | Read-only decision support based on the 2022 Taiwan lipid guidelines and 2026 ACC/AHA dyslipidemia guideline. Verify the complete chart, actual medication use, institutional workflow, and patient goals before acting.',
      ),
    }
  },
}
