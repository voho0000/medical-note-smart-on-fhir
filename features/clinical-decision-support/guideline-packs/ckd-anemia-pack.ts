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

function ckdStage(profile: CdssPatientProfile): 'G1–G2' | 'G3' | 'G4' | 'G5' | 'unknown' {
  const eGfr = numberFromFact(profile, 'eGFR')
  if (eGfr === undefined) return 'unknown'
  if (eGfr >= 60) return 'G1–G2'
  if (eGfr >= 30) return 'G3'
  if (eGfr >= 15) return 'G4'
  return 'G5'
}

function anemiaState(profile: CdssPatientProfile): {
  hemoglobin?: number
  threshold?: number
  anemia: boolean
} {
  const hemoglobin = numberFromFact(profile, 'hemoglobin')
  const sex = profile.demographics?.sex
  const threshold = sex === 'male' ? 13 : sex === 'female' ? 12 : undefined
  return {
    hemoglobin,
    threshold,
    anemia: hemoglobin !== undefined && threshold !== undefined && hemoglobin < threshold,
  }
}

function kdigoReference(
  locale: CdssLocale,
  id: string,
  recommendationId: string,
  locator: string,
  zh: string,
  en: string,
): GuidelineReference {
  return {
    id: `kdigo-anemia-2026-${id}`,
    title: 'KDIGO 2026 Clinical Practice Guideline for the Management of Anemia in Chronic Kidney Disease',
    publisher: 'Kidney Disease: Improving Global Outcomes (KDIGO)',
    version: '2026',
    url: 'https://kdigo.org/wp-content/uploads/2026/04/KDIGO-2026-Anemia-in-CKD-Guideline.pdf',
    recommendationId,
    locator,
    summary: text(locale, zh, en),
  }
}

function evaluationReference(locale: CdssLocale): GuidelineReference {
  return kdigoReference(
    locale,
    'evaluation',
    'Practice Points 1.2.1–1.2.3',
    'Chapter 1: diagnosis and evaluation',
    '成人男性 Hb <13 g/dL、女性 <12 g/dL 定義為貧血。初始檢查包含 CBC、網狀紅血球、ferritin 與 TSAT；未釐清時再依情境擴大檢查。ferritin <45 ng/mL 或小球性貧血可觸發失血來源評估。',
    'Anemia is defined as hemoglobin below 13 g/dL in adult males and below 12 g/dL in adult females. Initial testing includes CBC, reticulocytes, ferritin, and TSAT, followed by context-specific expanded testing when unexplained. Ferritin below 45 ng/mL or microcytosis can trigger evaluation for blood loss.',
  )
}

function ironReference(locale: CdssLocale): GuidelineReference {
  return kdigoReference(
    locale,
    'iron',
    'Recommendations 2.1 and 2.3; Practice Point 2.2',
    'Chapter 2: iron therapy',
    '非血液透析 CKD／腹膜透析的鐵治療門檻依 ferritin 與 TSAT 組合判讀；血液透析門檻不同。ferritin >700 ng/mL 或 TSAT ≥40% 時建議暫停例行鐵治療。',
    'Iron-treatment thresholds for nondialysis CKD/peritoneal dialysis use ferritin and TSAT combinations and differ from hemodialysis thresholds. Routine iron is withheld when ferritin is above 700 ng/mL or TSAT is at least 40%.',
  )
}

function esaReference(locale: CdssLocale): GuidelineReference {
  return kdigoReference(
    locale,
    'esa',
    'Recommendations 3.2.1–3.3.1',
    'Chapter 3: ESA initiation and maintenance',
    '非透析 CKD 的 ESA 起始需依症狀、輸血風險與 ESA 風險個人化；透析病人的起始門檻不同。成人維持治療不應把 Hb 目標設為 ≥11.5 g/dL。',
    'ESA initiation in nondialysis CKD is individualized using symptoms, transfusion risk, and ESA harms, while dialysis initiation thresholds differ. In adults receiving ESA maintenance, hemoglobin should not be targeted to at least 11.5 g/dL.',
  )
}

function buildDetectionAndMonitoring(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const state = anemiaState(profile)
  const stage = ckdStage(profile)
  const intervalDays = stage === 'G5' ? 90 : stage === 'G4' ? 183 : stage === 'G3' ? 365 : undefined
  const days = ageDays(profile.facts.hemoglobin, profile.evaluatedAt)
  const overdue = intervalDays !== undefined && (days === undefined || days > intervalDays)
  const thresholdMissing = state.hemoglobin !== undefined && state.threshold === undefined

  return {
    id: 'ckd-anemia-detection-monitoring',
    domain: 'monitoring',
    priority: state.anemia ? 'medium' : overdue ? 'medium' : 'routine',
    status: state.anemia
      ? 'review'
      : state.hemoglobin === undefined || thresholdMissing || overdue
        ? 'needs-data'
        : 'no-action',
    overviewEvidenceFactKey: profile.facts.hemoglobin ? 'hemoglobin' : 'eGFR',
    title: state.anemia
      ? text(locale, `Hb ${state.hemoglobin} g/dL：符合 CKD 貧血定義`, `Hemoglobin ${state.hemoglobin} g/dL meets the CKD anemia definition`)
      : overdue
        ? text(locale, `${stage}：Hb 監測已到期或資料不足`, `${stage}: hemoglobin monitoring is due or unavailable`)
        : thresholdMissing
          ? text(locale, `Hb ${state.hemoglobin} g/dL：缺少性別門檻資料`, `Hemoglobin ${state.hemoglobin} g/dL: sex-threshold data are missing`)
          : text(locale, '本次 Hb 未觸發性別特異貧血門檻', 'Current hemoglobin did not trigger the sex-specific anemia threshold'),
    recommendation: state.anemia
      ? text(locale, '先確認趨勢、症狀與貧血原因；單一 Hb 不會直接觸發鐵劑、ESA 或輸血。', 'First confirm the trend, symptoms, and cause. One hemoglobin value does not directly trigger iron, ESA, or transfusion.')
      : text(locale, '依 CKD 分期與症狀安排 Hb 監測：G3 至少每年、G4 至少每 6 個月、G5／G5D 至少每 3 個月。', 'Monitor hemoglobin according to CKD stage and symptoms: at least annually in G3, every 6 months in G4, and every 3 months in G5/G5D.'),
    rationale: text(locale, 'KDIGO 2026 使用性別特異 Hb 定義，且監測頻率隨 CKD 分期增加。', 'KDIGO 2026 uses sex-specific hemoglobin definitions and increases monitoring frequency with CKD stage.'),
    patientEvidence: compact([
      evidence(profile, locale, 'hemoglobin', 'Hb', 'Hemoglobin'),
      evidence(profile, locale, 'hemoglobinTrend', 'Hb 趨勢', 'Hemoglobin trend'),
      evidence(profile, locale, 'sex', '性別', 'Sex'),
      evidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
    ]),
    missingData: [
      ...(state.hemoglobin === undefined ? [text(locale, 'Hb 與採檢日期', 'Hemoglobin and collection date')] : []),
      ...(state.threshold === undefined ? [text(locale, '可用於貧血門檻判讀的性別資料', 'Sex data for the anemia threshold')] : []),
      ...(!profile.facts.hemoglobinTrend ? [text(locale, 'CBC／Hb 連續趨勢', 'CBC/hemoglobin trend')] : []),
      text(locale, '貧血症狀與出血症狀', 'Anemia and bleeding symptoms'),
    ],
    nextActions: [text(locale, '將下一次 Hb 時點與結果回看責任寫入 CKD 照護計畫。', 'Document the next hemoglobin date and result-review owner in the CKD care plan.')],
    guidelineReferences: [evaluationReference(locale)],
    safetyBoundary: text(locale, '缺少性別或 Hb 時不推定有或沒有貧血；單一數值不決定治療。', 'Anemia is not inferred as present or absent when sex or hemoglobin is missing; one value does not determine treatment.'),
  }
}

function buildInitialEvaluation(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const state = anemiaState(profile)
  const initial = [
    { key: 'hemoglobin', zh: 'CBC／Hb', en: 'CBC/hemoglobin' },
    { key: 'meanCorpuscularVolume', zh: 'MCV', en: 'MCV' },
    { key: 'reticulocytePercent', alternate: 'reticulocyteAbsolute', zh: '網狀紅血球', en: 'Reticulocyte count' },
    { key: 'ferritin', zh: 'ferritin', en: 'Ferritin' },
    { key: 'transferrinSaturation', zh: 'TSAT', en: 'TSAT' },
  ] as const
  const missing = initial
    .filter((item) => !profile.facts[item.key] && (!('alternate' in item) || !profile.facts[item.alternate]))
    .map((item) => text(locale, item.zh, item.en))

  return {
    id: 'ckd-anemia-initial-evaluation',
    domain: 'complication',
    priority: state.anemia ? 'medium' : 'routine',
    status: !state.anemia
      ? state.hemoglobin === undefined || state.threshold === undefined ? 'needs-data' : 'no-action'
      : missing.length > 0
        ? 'needs-data'
        : 'review',
    overviewEvidenceFactKey: profile.facts.hemoglobinTrend ? 'hemoglobinTrend' : 'hemoglobin',
    title: state.anemia
      ? missing.length > 0
        ? text(locale, `貧血初始鑑別尚缺 ${missing.length} 項`, `Initial anemia evaluation is missing ${missing.length} item(s)`)
        : text(locale, '貧血初始四組檢查已有可用資料，進入原因判讀', 'Core initial anemia tests are available; proceed to cause assessment')
      : text(locale, '尚未建立需啟動貧血鑑別的完整條件', 'Complete criteria to activate anemia evaluation are not yet established'),
    recommendation: text(
      locale,
      '以 CBC／MCV、網狀紅血球、ferritin 與 TSAT 判讀生成不足、缺鐵或其他原因；同步詢問出血、營養、感染／發炎與近期住院。',
      'Use CBC/MCV, reticulocytes, ferritin, and TSAT to assess underproduction, iron deficiency, or other causes, while reviewing bleeding, nutrition, infection/inflammation, and recent hospitalization.',
    ),
    rationale: text(locale, 'CKD 貧血是排除與共因評估路徑，不能只用 eGFR 與 Hb 歸因。', 'Anemia in CKD requires exclusion and assessment of coexisting causes and cannot be attributed from eGFR and hemoglobin alone.'),
    patientEvidence: compact([
      evidence(profile, locale, 'hemoglobinTrend', 'Hb 趨勢', 'Hemoglobin trend'),
      evidence(profile, locale, 'hemoglobin', 'Hb', 'Hemoglobin'),
      evidence(profile, locale, 'meanCorpuscularVolume', 'MCV', 'MCV'),
      evidence(profile, locale, 'reticulocytePercent', '網狀紅血球 %', 'Reticulocyte %'),
      evidence(profile, locale, 'reticulocyteAbsolute', '網狀紅血球絕對值', 'Absolute reticulocyte count'),
      evidence(profile, locale, 'ferritin', 'ferritin', 'Ferritin'),
      evidence(profile, locale, 'transferrinSaturation', 'TSAT', 'TSAT'),
    ]),
    missingData: missing,
    nextActions: [text(locale, '先完成初始檢查與病史，再決定是否進入擴大鑑別或治療評估。', 'Complete initial tests and history before deciding on expanded evaluation or treatment assessment.')],
    guidelineReferences: [evaluationReference(locale)],
    safetyBoundary: text(locale, '正常或升高 ferritin 可能受發炎影響；系統不把單一 ferritin 當作缺鐵排除。', 'Normal or elevated ferritin may be affected by inflammation; one ferritin value does not exclude iron deficiency.'),
  }
}

function buildIronPathway(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const state = anemiaState(profile)
  const ferritin = numberFromFact(profile, 'ferritin')
  const tsat = numberFromFact(profile, 'transferrinSaturation')
  const mcv = numberFromFact(profile, 'meanCorpuscularVolume')
  const missing = [
    ...(ferritin === undefined ? [text(locale, 'ferritin', 'Ferritin')] : []),
    ...(tsat === undefined ? [text(locale, 'TSAT', 'TSAT')] : []),
    text(locale, '透析狀態與目前鐵劑使用', 'Dialysis status and current iron therapy'),
  ]
  const bloodLossClue = (ferritin !== undefined && ferritin < 45)
    || (mcv !== undefined && mcv < 80)
  const withholdRoutineIron = (ferritin !== undefined && ferritin > 700)
    || (tsat !== undefined && tsat >= 40)
  const nonHdThreshold = ferritin !== undefined && tsat !== undefined && (
    (ferritin < 100 && tsat < 40)
    || (ferritin >= 100 && ferritin < 300 && tsat < 25)
  )

  return {
    id: 'ckd-anemia-iron-pathway',
    domain: 'medication',
    priority: bloodLossClue || withholdRoutineIron ? 'high' : state.anemia ? 'medium' : 'routine',
    status: !state.anemia
      ? state.hemoglobin === undefined || state.threshold === undefined ? 'needs-data' : 'no-action'
      : ferritin === undefined || tsat === undefined
        ? 'needs-data'
        : 'review',
    overviewEvidenceFactKey: bloodLossClue
      ? ferritin !== undefined && ferritin < 45 ? 'ferritin' : 'meanCorpuscularVolume'
      : 'transferrinSaturation',
    title: bloodLossClue
      ? text(locale, '缺鐵／小球性線索：評估失血來源', 'Iron-deficiency/microcytic clue: evaluate for blood loss')
      : withholdRoutineIron
        ? text(locale, 'ferritin／TSAT 達暫停例行鐵治療門檻', 'Ferritin/TSAT reaches a threshold to withhold routine iron')
        : nonHdThreshold
          ? text(locale, '符合非血液透析 CKD／腹膜透析的鐵治療評估門檻', 'Meets an iron-treatment assessment threshold for nondialysis CKD/peritoneal dialysis')
          : ferritin === undefined || tsat === undefined
            ? text(locale, '鐵狀態不足以分流', 'Iron status is insufficient for pathway triage')
            : text(locale, '現有 ferritin／TSAT 未觸發本版鐵治療門檻', 'Current ferritin/TSAT did not trigger this ruleset’s iron threshold'),
    recommendation: bloodLossClue
      ? text(locale, '依年齡、性別與症狀評估消化道、婦科或泌尿道失血；鐵補充不能取代出血原因查找。', 'Assess gastrointestinal, gynecologic, or urinary blood loss according to age, sex, and symptoms; iron replacement does not replace evaluation of the bleeding source.')
      : withholdRoutineIron
        ? text(locale, '核對是否正在使用鐵劑及近期輸注；依指引暫不追加例行鐵治療，並評估感染、發炎、鐵負荷與其他原因。', 'Reconcile current iron and recent infusions; do not add routine iron under the guideline threshold and assess infection, inflammation, iron loading, and other causes.')
        : nonHdThreshold
          ? text(locale, '先確認不是血液透析、評估症狀／感染／失血與目前鐵劑後，再由臨床人員討論口服或靜脈鐵；不由本模組直接開立。', 'First confirm the patient is not receiving hemodialysis and assess symptoms, infection, blood loss, and current iron before a clinician considers oral or intravenous iron; this module does not prescribe it.')
          : text(locale, '結合趨勢、發炎狀態、透析狀態與症狀判讀；不要只用單一 ferritin 或 TSAT 決定治療。', 'Interpret trends with inflammation, dialysis status, and symptoms; do not use one ferritin or TSAT result alone to determine treatment.'),
    rationale: text(locale, 'KDIGO 2026 的鐵治療門檻依透析狀態及 ferritin／TSAT 組合而異。', 'KDIGO 2026 iron thresholds vary by dialysis status and the ferritin/TSAT combination.'),
    patientEvidence: compact([
      evidence(profile, locale, 'ferritin', 'ferritin', 'Ferritin'),
      evidence(profile, locale, 'transferrinSaturation', 'TSAT', 'TSAT'),
      evidence(profile, locale, 'meanCorpuscularVolume', 'MCV', 'MCV'),
      evidence(profile, locale, 'cReactiveProtein', 'CRP', 'CRP'),
      evidence(profile, locale, 'hemoglobin', 'Hb', 'Hemoglobin'),
    ]),
    missingData: missing,
    nextActions: [text(locale, '記錄鐵狀態分流、失血評估需要與治療／複驗計畫。', 'Document iron-status triage, need for blood-loss evaluation, and the treatment/retesting plan.')],
    guidelineReferences: [evaluationReference(locale), ironReference(locale)],
    safetyBoundary: text(locale, '血液透析與非血液透析門檻不同；未確認透析狀態時不自動產生鐵劑建議。', 'Hemodialysis and nondialysis thresholds differ; no automatic iron recommendation is made when dialysis status is unknown.'),
  }
}

function buildExpandedEvaluationAndEsa(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const state = anemiaState(profile)
  const expanded = [
    { key: 'vitaminB12', zh: 'vitamin B12', en: 'Vitamin B12' },
    { key: 'folate', zh: 'folate', en: 'Folate' },
    { key: 'cReactiveProtein', zh: 'CRP', en: 'CRP' },
    { key: 'lactateDehydrogenase', zh: 'LDH', en: 'LDH' },
    { key: 'haptoglobin', zh: 'haptoglobin', en: 'Haptoglobin' },
    { key: 'thyroidStimulatingHormone', zh: 'TSH', en: 'TSH' },
  ] as const
  const missing = expanded
    .filter((item) => !profile.facts[item.key])
    .map((item) => text(locale, item.zh, item.en))
  const lowerHemoglobin = state.hemoglobin !== undefined && state.hemoglobin < 10

  return {
    id: 'ckd-anemia-expanded-evaluation-esa-safety',
    domain: 'safety',
    priority: lowerHemoglobin ? 'high' : state.anemia ? 'medium' : 'routine',
    status: !state.anemia
      ? state.hemoglobin === undefined || state.threshold === undefined ? 'needs-data' : 'no-action'
      : 'review',
    overviewEvidenceFactKey: 'hemoglobin',
    title: lowerHemoglobin
      ? text(locale, `Hb ${state.hemoglobin} g/dL：完成擴大鑑別與 ESA／輸血風險效益評估`, `Hemoglobin ${state.hemoglobin} g/dL: complete expanded evaluation and ESA/transfusion risk-benefit review`)
      : state.anemia
        ? text(locale, '貧血原因未明時的擴大鑑別與 ESA 安全護欄', 'Expanded evaluation and ESA safety guardrails for unexplained anemia')
        : text(locale, '目前未觸發 ESA 評估路徑', 'The ESA assessment pathway is not currently triggered'),
    recommendation: text(
      locale,
      '若初始檢查未說明原因，依情境補周邊血抹片、B12、folate、CRP、溶血、肝功能、TSH、PTH、單株蛋白與潛血檢查。非透析 CKD 是否開始 ESA 需依症狀、輸血風險、心血管／血栓與癌症風險個人化；不可由單一 Hb 自動觸發。',
      'If initial testing does not explain the anemia, add context-specific smear, B12, folate, CRP, hemolysis, liver, TSH, PTH, monoclonal-protein, and occult-blood testing. ESA initiation in nondialysis CKD is individualized using symptoms, transfusion risk, cardiovascular/thrombotic risk, and cancer risk and is never triggered automatically by one hemoglobin value.',
    ),
    rationale: text(locale, 'CKD 可與營養缺乏、發炎、溶血、內分泌、骨髓或失血原因並存；ESA 的效益與傷害需共同決策。', 'CKD can coexist with nutritional, inflammatory, hemolytic, endocrine, marrow, or blood-loss causes; ESA benefits and harms require shared decision-making.'),
    patientEvidence: compact([
      evidence(profile, locale, 'hemoglobin', 'Hb', 'Hemoglobin'),
      evidence(profile, locale, 'vitaminB12', 'B12', 'B12'),
      evidence(profile, locale, 'folate', 'folate', 'Folate'),
      evidence(profile, locale, 'cReactiveProtein', 'CRP', 'CRP'),
      evidence(profile, locale, 'lactateDehydrogenase', 'LDH', 'LDH'),
      evidence(profile, locale, 'haptoglobin', 'haptoglobin', 'Haptoglobin'),
      evidence(profile, locale, 'thyroidStimulatingHormone', 'TSH', 'TSH'),
      evidence(profile, locale, 'parathyroidHormone', 'PTH', 'PTH'),
    ]),
    missingData: [
      ...missing,
      text(locale, '周邊血抹片、肝功能、PTH、單株蛋白與糞便潛血（依情境）', 'Peripheral smear, liver tests, PTH, monoclonal-protein testing, and fecal occult blood as indicated'),
      ...(state.anemia ? [text(locale, '症狀、輸血需求／風險、心血管／血栓與癌症風險、透析狀態', 'Symptoms, transfusion need/risk, cardiovascular/thrombotic and cancer risk, and dialysis status')] : []),
    ],
    nextActions: [text(locale, '由臨床人員先記錄病因評估，再決定是否轉腎臟科／血液科或討論 ESA。', 'Have a clinician document the cause evaluation before deciding on nephrology/hematology referral or ESA discussion.')],
    guidelineReferences: [evaluationReference(locale), esaReference(locale)],
    safetyBoundary: text(locale, '本模組不診斷「腎性貧血」、不開立 ESA，也不設定個別 Hb 目標。', 'This module does not diagnose renal anemia, prescribe ESA, or set an individual hemoglobin target.'),
  }
}

export const CKD_ANEMIA_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'ckd-anemia-cdss',
  diseaseCode: 'CKD-ANEMIA',
  version: '1.0.0',
  enabled: true,
  label: { zh: 'CKD 貧血', en: 'CKD anemia' },
  applies(profile) {
    return profile.eligibleDiseasePackIds?.includes('ckd-poc') === true
  },
  build({ profile, locale }) {
    const recommendations = [
      buildDetectionAndMonitoring(profile, locale),
      buildInitialEvaluation(profile, locale),
      buildIronPathway(profile, locale),
      buildExpandedEvaluationAndEsa(profile, locale),
    ]
    return {
      title: text(locale, '貧血鑑別與 CKD anemia 路徑', 'Anemia differential and CKD anemia pathway'),
      summary: text(locale, '由 Hb 監測進入初始鑑別、鐵狀態分流、失血查找與 ESA 安全評估。', 'Moves from hemoglobin monitoring to initial differential, iron-status triage, blood-loss evaluation, and ESA safety assessment.'),
      packId: 'ckd-anemia-cdss',
      packVersion: '1.0.0',
      knowledgePacks: [{
        id: 'kdigo-anemia-2026',
        kind: 'guideline',
        label: text(locale, 'KDIGO CKD 貧血指引', 'KDIGO anemia in CKD guideline'),
        version: '2026',
        effectiveFrom: '2026-04-17',
      }],
      recommendations,
      notEvaluated: [
        text(locale, '症狀嚴重度、完整 CBC／血抹片、透析狀態、近期輸血／鐵劑／ESA、活動性出血、感染、癌症與完整住院資料。', 'Symptom severity, complete CBC/smear, dialysis status, recent transfusion/iron/ESA, active bleeding, infection, cancer, and complete inpatient data.'),
      ],
      disclaimer: text(locale, '唯讀決策支援；不是貧血病因診斷、鐵劑／ESA／輸血處方。嚴重症狀、活動性出血或不穩定病人需立即臨床評估。', 'Read-only decision support; not a diagnosis of anemia cause or a prescription for iron, ESA, or transfusion. Severe symptoms, active bleeding, or instability require immediate clinical assessment.'),
    }
  },
}
