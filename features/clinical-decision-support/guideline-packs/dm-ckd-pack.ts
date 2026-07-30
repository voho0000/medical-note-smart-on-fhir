import type {
  CdssLocale,
  CdssMedicationClassId,
  CdssMedicationClassState,
  CdssPatientProfile,
  CdssRecommendation,
  ClinicalEvidence,
  ClinicalGuidelinePack,
  GuidelineReference,
} from '../types'
import { buildEnabledClinicalModules } from '../clinical-modules/registry'
import { attachKnowledgeAssessments } from '../knowledge-packs/registry'

const TAIWAN_DKD_GUIDELINE_URL = 'https://www.endo-dm.org.tw/DB/book/131/2024%20%E5%8F%B0%E7%81%A3%E7%B3%96%E5%B0%BF%E7%97%85%E8%85%8E%E8%87%9F%E7%96%BE%E7%97%85%E8%87%A8%E5%BA%8A%E7%85%A7%E8%AD%B7%E6%8C%87%E5%BC%95_%E7%B7%A8%E6%8E%92%20v10_FINAL%28%E6%9B%B4%E6%96%B0%E4%BD%9C%E8%80%85%29.pdf?v=1777515319'
const ADA_PHARMACOLOGY_2026_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment'
const ADA_OLDER_ADULTS_2026_URL = 'https://diabetesjournals.org/care/article/49/Supplement_1/S277/163921/13-Older-Adults-Standards-of-Care-in-Diabetes-2026'
const FDA_FARXIGA_2024_LABEL_URL = 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/202293s031lbl.pdf'
const FDA_KERENDIA_LABEL_URL = 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/215341s009lbl.pdf'
const KDIGO_CKD_2024_URL = 'https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf'

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function fact(profile: CdssPatientProfile, key: string, locale: CdssLocale): string | undefined {
  const value = profile.facts[key]
  return value?.[locale === 'en' ? 'en' : 'zh']
}

function numberFromFact(profile: CdssPatientProfile, key: string): number | undefined {
  const value = profile.facts[key]?.numericValue
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function medicationClassState(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): CdssMedicationClassState {
  return profile.medicationClassContexts?.[classId]?.state ?? 'not-found'
}

function hasDocumentedClassAllergy(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): boolean {
  return profile.medicationClassContexts?.[classId]?.allergyState === 'documented'
}

function isFresh(
  profile: CdssPatientProfile,
  key: string,
): boolean {
  const context = profile.freshnessContexts?.[key]
  if (context) return context.state === 'current'
  if (key === 'quantitativeUacr') {
    return Boolean(
      profile.facts.urineAlbuminRatioQuantitative
      ?? profile.facts.urineAlbuminRatio,
    )
  }
  return Boolean(profile.facts[key])
}

function isStale(
  profile: CdssPatientProfile,
  key: string,
): boolean {
  const state = profile.freshnessContexts?.[key]?.state
  return state === 'due' || state === 'overdue'
}

function patientEvidence(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  key: string,
  labelZh: string,
  labelEn: string,
): ClinicalEvidence | undefined {
  const value = fact(profile, key, locale)
  if (!value) return undefined
  return {
    label: text(locale, labelZh, labelEn),
    value,
    factKeys: [key],
    sources: profile.facts[key]?.sources,
  }
}

function compactEvidence(
  values: readonly (ClinicalEvidence | undefined)[],
): ClinicalEvidence[] {
  return values.filter((value): value is ClinicalEvidence => Boolean(value))
}

function evidenceForOverview(
  values: readonly (ClinicalEvidence | undefined)[],
  preferredFactKeys: readonly string[],
): Pick<CdssRecommendation, 'patientEvidence' | 'overviewEvidenceFactKey'> {
  const patientEvidence = compactEvidence(values)
  const overviewEvidenceFactKey = preferredFactKeys.find((key) => (
    patientEvidence.some((evidence) => evidence.factKeys.includes(key))
  )) ?? patientEvidence[0]?.factKeys[0]

  return {
    patientEvidence,
    ...(overviewEvidenceFactKey ? { overviewEvidenceFactKey } : {}),
  }
}

function taiwanKidneyReference(
  locale: CdssLocale,
  id: string,
  locator: string,
  summaryZh: string,
  summaryEn: string,
): GuidelineReference {
  return {
    id,
    title: text(locale, '2024 台灣糖尿病腎臟疾病臨床照護指引', '2024 Taiwan Clinical Practice Guideline for Diabetic Kidney Disease'),
    publisher: text(locale, '中華民國糖尿病學會', 'Diabetes Association of the Republic of China (Taiwan)'),
    version: '2024',
    url: TAIWAN_DKD_GUIDELINE_URL,
    locator,
    summary: text(locale, summaryZh, summaryEn),
  }
}

function buildDiagnosisConfirmation(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'HbA1c', '糖化血色素', 'HbA1c'),
  ], ['HbA1c'])

  return {
    id: 'confirm-diabetes-diagnosis',
    domain: 'diagnosis',
    priority: 'high',
    status: 'needs-data',
    ...evidence,
    title: text(locale, '先確認糖尿病診斷，再啟動治療型建議', 'Confirm diabetes before activating treatment recommendations'),
    recommendation: text(
      locale,
      '目前只有糖化血色素落在需確認範圍，不能直接等同第二型糖尿病診斷。先依臨床情境確認診斷，確認前不產生糖尿病用藥調整建議。',
      'The available HbA1c is in a range that requires diagnostic confirmation; it is not treated as a confirmed type 2 diabetes diagnosis. Confirm the diagnosis before generating treatment recommendations.',
    ),
    rationale: text(
      locale,
      '這能避免把單次檢驗結果升格成診斷，也避免在診斷未確認時套用錯誤的治療路徑。',
      'This prevents a single laboratory result from being promoted to a diagnosis and avoids applying the wrong treatment pathway.',
    ),
    missingData: [text(locale, '可採用的診斷紀錄或必要的確認檢驗', 'A governed diagnosis record or required confirmatory testing')],
    nextActions: [
      text(locale, '核對症狀、檢驗條件、既往糖尿病診斷與可能影響結果的因素。', 'Review symptoms, test conditions, previous diabetes diagnoses, and factors that could affect the result.'),
      text(locale, '依院內診斷流程完成確認，確認後再重新執行 DM CDSS。', 'Complete confirmation using the local diagnostic workflow, then rerun the DM CDSS.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(locale, '本節不建立診斷，也不提供開始或調整藥物的指令。', 'This section does not establish a diagnosis or direct medication initiation or adjustment.'),
  }
}

function buildKidneyRiskCompletion(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  hasQuantitativeUacr: boolean,
): CdssRecommendation {
  const urineEvidence = patientEvidence(
    profile,
    locale,
    profile.facts.urineAlbuminOverview ? 'urineAlbuminOverview' : 'urineAlbuminRatio',
    '最新 ACR',
    'Latest ACR',
  )
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'eGFR', '最新腎絲球過濾率', 'Latest eGFR'),
    patientEvidence(profile, locale, 'kidneyDiagnosis', '腎臟診斷紀錄', 'Kidney diagnosis record'),
    urineEvidence,
  ], ['urineAlbuminOverview', 'urineAlbuminRatio', 'eGFR', 'kidneyDiagnosis'])
  const quantitativeUacrCurrent = hasQuantitativeUacr && isFresh(profile, 'quantitativeUacr')
  const quantitativeUacrStale = hasQuantitativeUacr && isStale(profile, 'quantitativeUacr')
  const eGfrCurrent = isFresh(profile, 'eGFR')
  const uacrIntervalMonths = (profile.freshnessContexts?.quantitativeUacr?.intervalDays ?? 365) >= 365
    ? 12
    : 6
  const kidneyMeasuresCurrent = quantitativeUacrCurrent && eGfrCurrent
  const missingData = [
    ...(!quantitativeUacrCurrent
      ? [quantitativeUacrStale
          ? text(
              locale,
              `更新定量 UACR（最近一筆已超過此病人 ${uacrIntervalMonths} 個月追蹤間隔）`,
              `Updated quantitative UACR (the latest result exceeds this patient’s ${uacrIntervalMonths}-month interval)`,
            )
          : urineEvidence
            ? text(locale, '可用 mg/g 判讀的定量尿白蛋白／肌酸酐比', 'A quantitative urine albumin-to-creatinine ratio reported in mg/g')
            : text(locale, '定量尿白蛋白／肌酸酐比與採檢日期', 'Quantitative urine albumin-to-creatinine ratio and collection date')]
      : []),
    ...(!eGfrCurrent
      ? [isStale(profile, 'eGFR')
          ? text(locale, '更新 eGFR（最近一筆已超過此病人的追蹤間隔）', 'Updated eGFR (the latest result exceeds this patient’s monitoring interval)')
          : text(locale, '可判讀的 eGFR 與採檢日期', 'An interpretable eGFR and collection date')]
      : []),
  ]

  return {
    id: 'complete-kidney-risk',
    domain: 'monitoring',
    priority: 'high',
    status: kidneyMeasuresCurrent ? 'review' : 'needs-data',
    ...evidence,
    hideNarrative: true,
    title: kidneyMeasuresCurrent
      ? text(locale, '用腎絲球過濾率與定量尿白蛋白完成腎臟風險分層', 'Complete kidney risk staging with eGFR and quantitative UACR')
      : quantitativeUacrStale
        ? text(locale, '定量 UACR 已超過追蹤間隔；更新後完成腎臟風險分層', 'Quantitative UACR is past its monitoring interval; update it to complete kidney risk staging')
        : quantitativeUacrCurrent && !eGfrCurrent
          ? text(locale, 'eGFR 已超過追蹤間隔；更新後完成腎臟風險分層', 'eGFR is past its monitoring interval; update it to complete kidney risk staging')
          : urineEvidence
            ? text(locale, '已有半定量 UACR；補做定量檢驗完成腎臟風險分層', 'A semiquantitative UACR is present; obtain a quantitative result to complete kidney risk staging')
            : text(locale, '補齊定量尿白蛋白／肌酸酐比，完成腎臟風險分層', 'Obtain quantitative UACR to complete kidney risk staging'),
    recommendation: kidneyMeasuresCurrent
      ? text(
          locale,
          '將目前腎絲球過濾率與定量尿白蛋白／肌酸酐比放入同一個風險分層，據此決定追蹤頻率與是否需要腎臟專科共同照護。',
          'Combine the current eGFR and quantitative urine albumin-to-creatinine ratio in one risk classification to determine monitoring and referral needs.',
        )
      : hasQuantitativeUacr
        ? text(
            locale,
            '定量 UACR 或 eGFR 已超過此病人的追蹤間隔；更新到期項目後再完成 CKD G/A 分層。',
            'Quantitative UACR or eGFR is past this patient’s monitoring interval. Update the due measure before completing CKD G/A staging.',
          )
      : text(
          locale,
          '目前尿檢不是可安全量化與追蹤的尿白蛋白／肌酸酐比。請取得或找回定量結果，再和腎絲球過濾率一起分層；若結果異常，依指引安排確認。',
          'The current urine record is not suitable for quantitative longitudinal interpretation. Obtain or locate a quantitative urine albumin-to-creatinine ratio, combine it with eGFR for staging, and confirm an abnormal result according to the guideline.',
        ),
    rationale: text(
      locale,
      '腎絲球過濾率反映過濾功能，尿白蛋白反映腎臟損傷；兩個維度共同決定風險，半定量紀錄不能取代定量數值。',
      'eGFR reflects filtration while urine albumin reflects kidney damage. Both dimensions determine risk, and a semiquantitative record cannot replace a quantitative value.',
    ),
    missingData,
    nextActions: [
      kidneyMeasuresCurrent
        ? text(locale, '確認定量尿白蛋白結果的日期、單位與是否已重複確認。', 'Confirm the date, unit, and confirmation status of the quantitative urine albumin result.')
        : quantitativeUacrStale
          ? text(locale, '更新定量 UACR 與到期的 eGFR，再重算 CKD G/A 分層。', 'Update quantitative UACR and any due eGFR, then recalculate CKD G/A staging.')
        : urineEvidence
          ? text(locale, '補做定量 UACR（mg/g）；目前半定量結果不轉換成定量分級。', 'Obtain quantitative UACR in mg/g; do not convert the current semiquantitative result into a quantitative category.')
          : text(locale, '開立或查找定量尿白蛋白與肌酸酐的同次尿液檢驗。', 'Order or locate quantitative urine albumin and creatinine from the same urine sample.'),
      text(locale, '完成腎臟風險分層後，再設定追蹤頻率與轉診門檻。', 'Set the monitoring interval and referral threshold after kidney risk staging is complete.'),
    ],
    guidelineReferences: [
      taiwanKidneyReference(
        locale,
        'TDA-DKD-2024-screening',
        text(locale, '第 1 章，頁 14、16–17', 'Chapter 1, pp. 14, 16–17'),
        '糖尿病患者應定期評估腎功能；指引建議以定量尿白蛋白／肌酸酐比與腎絲球過濾率判讀，異常結果需依時程確認。',
        'People with diabetes should receive kidney assessment using quantitative UACR and eGFR; abnormal results require confirmation over time.',
      ),
    ],
    safetyBoundary: text(
      locale,
      '目前資料若只有半定量尿檢，不會被轉換成定量數值，也不會據此宣告白蛋白尿分級。',
      'A semiquantitative urine result is never converted into a quantitative value or used to declare an albuminuria category.',
    ),
  }
}

function buildEgfrTrajectory(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'eGFRTrend', '腎絲球過濾率趨勢', 'eGFR trend'),
    patientEvidence(profile, locale, 'kidneyDiagnosis', '腎臟診斷紀錄', 'Kidney diagnosis record'),
  ], ['eGFRTrend', 'kidneyDiagnosis'])

  return {
    id: 'review-egfr-trajectory',
    domain: 'monitoring',
    priority: 'medium',
    status: 'review',
    ...evidence,
    hideNarrative: true,
    title: text(locale, '檢視腎功能的連續變化', 'Review the longitudinal kidney-function record'),
    recommendation: text(
      locale,
      '不要只看最新一筆。請核對每次採檢間隔、數值方向、近期急性病況、體液狀態與可能影響腎功能的藥物，再判斷是穩定、慢性變化、短期波動或可逆因素。',
      'Do not rely on the latest value alone. Review test intervals, direction, recent acute illness, volume status, and medicines that may affect kidney function before classifying the series as stable, chronically changing, short-term variation, or a reversible effect.',
    ),
    rationale: text(
      locale,
      '病歷已有可比較的連續結果，方向較單點數值更有決策價值；但目前模組不依不完整日期自行計算年下降速率。',
      'Comparable longitudinal values are more useful than a single result, but this module does not calculate an annual decline rate from incomplete timing data.',
    ),
    nextActions: [
      text(locale, '補驗定量 UACR，完成 CKD G/A 分層。', 'Obtain quantitative UACR and complete CKD G/A staging.'),
      text(locale, '若排除急性可逆因素後腎絲球過濾率仍下降，提前複檢並評估腎臟科共同照護。', 'If eGFR continues to decline after reversible acute factors are excluded, retest earlier and evaluate nephrology co-management.'),
    ],
    guidelineReferences: [
      taiwanKidneyReference(
        locale,
        'TDA-DKD-2024-classification',
        text(locale, '第 1 章，頁 17', 'Chapter 1, p. 17'),
        '腎臟病判讀需同時考量持續時間、腎絲球過濾率與尿白蛋白，不能只靠單一檢驗。',
        'Kidney disease assessment considers persistence, eGFR, and albuminuria rather than a single test.',
      ),
    ],
    safetyBoundary: text(
      locale,
      '本節提示需要臨床重新評估，不把趨勢自動歸因於糖尿病，也不直接宣告急性腎損傷。',
      'This section prompts clinical reassessment; it does not automatically attribute the trend to diabetes or diagnose acute kidney injury.',
    ),
  }
}

function buildSglt2Review(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  eGfr: number | undefined,
  hasGovernedCkdEvidence: boolean,
): CdssRecommendation {
  const useContext = profile.medicationContexts?.forxiga
  const isUnconfirmedOrder = useContext?.useState === 'active_order_unconfirmed'
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'forxiga', '處方紀錄', 'Medication order'),
    patientEvidence(profile, locale, 'forxigaUseStatus', '用藥狀態', 'Medication use status'),
    patientEvidence(profile, locale, 'eGFR', '最新腎絲球過濾率', 'Latest eGFR'),
  ], ['forxigaUseStatus', 'forxiga', 'eGFR'])

  return {
    id: 'sglt2-concordance',
    domain: 'medication',
    priority: 'medium',
    status: 'review',
    ...evidence,
    hideNarrative: true,
    title: hasGovernedCkdEvidence
      ? text(locale, '核對 SGLT2 抑制劑的實際使用與腎臟保護策略', 'Reconcile actual SGLT2 inhibitor use and kidney-protection strategy')
      : text(locale, '核對 SGLT2 抑制劑的實際使用與適應症', 'Reconcile actual SGLT2 inhibitor use and indication'),
    recommendation: text(
      locale,
      `${hasGovernedCkdEvidence && eGfr !== undefined && eGfr >= 20
        ? '目前病歷有受治理的慢性腎臟病證據，且腎絲球過濾率落在指引討論範圍；若確認正在使用且耐受，心腎適應症不因 HbA1c 偏低而單獨停藥。'
        : hasGovernedCkdEvidence
          ? '目前病歷有受治理的慢性腎臟病證據，但 SGLT2 抑制劑是否適用仍需依完整腎功能與臨床狀況判斷。'
          : '目前資料不足以確認糖尿病合併慢性腎臟病的指引適用前提；請先核對本次處方適應症。'}${isUnconfirmedOrder ? '目前只看到有效處方，不能當作病人確實正在服用。' : '仍需核對實際服用情形。'}請確認適應症、耐受性、體液狀態與暫停用藥情境。`,
      `${hasGovernedCkdEvidence && eGfr !== undefined && eGfr >= 20
        ? 'The record contains governed CKD evidence and the eGFR is within the guideline discussion range. If current use and tolerance are confirmed, do not stop a cardiorenal indication solely because A1c is low. '
        : hasGovernedCkdEvidence
          ? 'The record contains governed CKD evidence, but SGLT2 inhibitor suitability still depends on complete kidney and clinical context. '
          : 'The available data do not establish the CKD prerequisite for this guideline pathway; first verify the indication for the prescription. '}${isUnconfirmedOrder ? 'The current record is an active order, not confirmation that the patient is taking it. ' : 'Actual use still requires reconciliation. '}Confirm indication, tolerance, volume status, and temporary hold situations.`,
    ),
    rationale: text(
      locale,
      hasGovernedCkdEvidence
        ? '在符合適應症與腎功能條件時，這類藥物除降血糖外也可能帶來心腎效益；高齡與腎功能下降時，仍需提高對脫水、姿勢性低血壓、泌尿生殖感染與生病期間風險的警覺。'
        : 'SGLT2 抑制劑可能因血糖、心臟或腎臟適應症開立；單一有效處方無法證明本病人符合哪一條路徑，因此先做適應症與實際用藥核對。',
      hasGovernedCkdEvidence
        ? 'When indication and kidney-function criteria are met, this class may provide cardiorenal benefit beyond glucose lowering. Older age and reduced kidney function still warrant review of volume depletion, orthostasis, genitourinary infection, and sick-day risks.'
        : 'An SGLT2 inhibitor may be prescribed for glycemic, cardiac, or kidney indications. A single active order does not establish which pathway applies, so indication and actual use require reconciliation.',
    ),
    missingData: [
      text(locale, '病人實際服用情形、耐受性、近期急性病況與體液狀態', 'Actual use, tolerance, recent acute illness, and volume status'),
    ],
    nextActions: [
      text(locale, '完成處方與實際用藥核對，包含服用方式、依從性與不良反應。', 'Reconcile the prescription with actual use, including administration, adherence, and adverse effects.'),
      text(
        locale,
        'dapagliflozin 在重大手術或預期長時間禁食前至少停 3 天；恢復進食且臨床穩定後再恢復。不要把顯影劑檢查一律設為停藥條件。',
        'Withhold dapagliflozin for at least 3 days before major surgery or procedures with prolonged fasting; resume after oral intake has restarted and the patient is clinically stable. Do not use contrast exposure alone as a universal hold rule.',
      ),
    ],
    guidelineReferences: [
      taiwanKidneyReference(
        locale,
        'TDA-DKD-2024-SGLT2',
        text(locale, '第 3 章，頁 45', 'Chapter 3, p. 45'),
        '糖尿病合併慢性腎臟病且腎絲球過濾率達適用範圍時，指引支持納入 SGLT2 抑制劑以降低腎臟與心血管風險。',
        'For diabetes with CKD and an eligible eGFR, the guideline supports SGLT2 inhibitor therapy to reduce kidney and cardiovascular risk.',
      ),
      {
        id: 'ADA-2026-9.10',
        title: 'Pharmacologic Approaches to Glycemic Treatment: Standards of Care in Diabetes—2026',
        publisher: 'American Diabetes Association',
        version: '2026',
        url: ADA_PHARMACOLOGY_2026_URL,
        recommendationId: '9.10',
        summary: text(
          locale,
          '第二型糖尿病合併慢性腎臟病（腎絲球過濾率 20–60 或白蛋白尿）應考慮具實證效益的 SGLT2 抑制劑或 GLP-1 受體促效劑，目的同時包含延緩腎病與降低心血管事件。',
          'For type 2 diabetes with CKD (eGFR 20–60 and/or albuminuria), use an SGLT2 inhibitor or GLP-1 RA with demonstrated benefit for kidney and cardiovascular outcomes.',
        ),
      },
      {
        id: 'FDA-FARXIGA-2024-2.4',
        title: 'FARXIGA (dapagliflozin) Prescribing Information',
        publisher: 'U.S. Food and Drug Administration',
        version: '2024',
        url: `${FDA_FARXIGA_2024_LABEL_URL}#page=4`,
        page: 4,
        recommendationId: 'Section 2.4',
        locator: text(locale, '第 2.4 節：手術暫停', 'Section 2.4: temporary interruption for surgery'),
        summary: text(
          locale,
          '重大手術或伴隨長時間禁食的處置前至少停用 3 天；病人臨床穩定且恢復口服進食後再恢復。',
          'Withhold for at least 3 days before major surgery or procedures with prolonged fasting and resume when clinically stable with oral intake restored.',
        ),
      },
    ],
    safetyBoundary: text(
      locale,
      '這是藥物類別與病歷核對提示，不是個別病人的開藥、停藥或劑量指示。',
      'This is a medication-class and reconciliation prompt, not an instruction to start, stop, or dose a medicine.',
    ),
  }
}

function buildGlycemicSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  age: number,
): CdssRecommendation {
  const insulinState = medicationClassState(profile, 'insulin')
  const sulfonylureaState = medicationClassState(profile, 'sulfonylurea')
  const hasHighRiskMedication = (
    insulinState === 'confirmed-current'
    || sulfonylureaState === 'confirmed-current'
  )
  const hasUnconfirmedOrder = (
    insulinState === 'active-order-unconfirmed'
    || sulfonylureaState === 'active-order-unconfirmed'
  )
  const hasHeldMedication = (
    insulinState === 'on-hold'
    || sulfonylureaState === 'on-hold'
  )
  const hasHistoricalMedication = (
    insulinState === 'historical-record-current-status-unknown'
    || sulfonylureaState === 'historical-record-current-status-unknown'
  )
  const medicationClassificationUncertain = (
    insulinState === 'uncertain' || sulfonylureaState === 'uncertain'
  )
  const healthStatus = profile.olderAdultContext?.healthStatus
  const healthStatusMissing = healthStatus === undefined
  const veryComplexHealth = healthStatus === 'very-complex-poor-health'
  const hba1c = numberFromFact(profile, 'HbA1c')
  const hba1cCurrent = isFresh(profile, 'HbA1c')
  const hba1cNeedsUpdate = !hba1cCurrent
  const hba1cIntervalMonths = (profile.freshnessContexts?.HbA1c?.intervalDays ?? 90) >= 180
    ? 6
    : 3
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'age', '年齡', 'Age'),
    patientEvidence(profile, locale, 'HbA1c', '糖化血色素', 'HbA1c'),
    patientEvidence(profile, locale, 'eGFR', '腎絲球過濾率', 'eGFR'),
    patientEvidence(
      profile,
      locale,
      'hypoglycemiaRiskMedications',
      '系統核對用藥',
      'Medication-list check',
    ),
  ], ['hypoglycemiaRiskMedications', 'HbA1c', 'age', 'eGFR'])

  const title = medicationClassificationUncertain
    ? text(
        locale,
        '降糖藥成分未完整辨識，暫不能判讀低血糖高風險藥物',
        'Incomplete ingredient mapping prevents a complete high-risk medication assessment',
      )
    : hasHighRiskMedication
      ? text(
          locale,
          `${hba1c !== undefined ? `HbA1c ${hba1c}%：` : ''}先評估低血糖，再決定是否減少胰島素／磺醯脲`,
          `${hba1c !== undefined ? `HbA1c ${hba1c}%: ` : ''}Assess hypoglycemia before deintensifying insulin or a sulfonylurea`,
        )
      : hasUnconfirmedOrder
        ? text(
            locale,
            '已有胰島素／磺醯脲處方，先確認是否實際使用',
            'An insulin/sulfonylurea order is present; confirm actual use',
          )
        : hasHeldMedication
          ? text(
              locale,
              '胰島素／磺醯脲暫停中，核對停藥原因與目前血糖',
              'Insulin/sulfonylurea is on hold; review the reason and current glycemia',
            )
          : hasHistoricalMedication
            ? text(
                locale,
                '有歷史胰島素／磺醯脲處方，近期是否持續未知',
                'A historical insulin/sulfonylurea record exists; current use is unknown',
              )
            : healthStatusMissing
              ? text(
                  locale,
                  `${hba1c !== undefined ? `HbA1c ${hba1c}%：` : ''}先完成健康、ADL／IADL、認知與衰弱分層`,
                  `${hba1c !== undefined ? `HbA1c ${hba1c}%: ` : ''}complete health, ADL/IADL, cognition, and frailty stratification first`,
                )
              : veryComplexHealth
                ? text(
                    locale,
                    `${hba1c !== undefined ? `HbA1c ${hba1c}%：` : ''}very complex／poor health，不依單一 A1c 判斷`,
                    `${hba1c !== undefined ? `HbA1c ${hba1c}%: ` : ''}very complex/poor health; do not rely on A1c alone`,
                  )
          : hba1cNeedsUpdate
            ? text(
                locale,
                `HbA1c 已超過 ${hba1cIntervalMonths} 個月追蹤間隔；未見胰島素／磺醯脲`,
                `HbA1c is past its ${hba1cIntervalMonths}-month interval; no insulin or sulfonylurea appears`,
              )
            : text(
                locale,
                healthStatus === 'complex-intermediate'
                  ? `${hba1c !== undefined ? `HbA1c ${hba1c}%：` : ''}已納入 complex／intermediate health 個人化判讀`
                  : `${hba1c !== undefined ? `HbA1c ${hba1c}%：` : ''}已納入 healthy older adult 個人化判讀`,
                healthStatus === 'complex-intermediate'
                  ? `${hba1c !== undefined ? `HbA1c ${hba1c}%: ` : ''}interpreted in a complex/intermediate-health context`
                  : `${hba1c !== undefined ? `HbA1c ${hba1c}%: ` : ''}interpreted in a healthy older-adult context`,
              )

  return {
    id: 'glycemic-safety-older-adult',
    domain: 'target',
    priority: hasHighRiskMedication
      ? 'high'
      : medicationClassificationUncertain
        || hasUnconfirmedOrder
        || hasHeldMedication
        || hasHistoricalMedication
        || healthStatusMissing
        || veryComplexHealth
        || hba1cNeedsUpdate
        ? 'medium'
        : 'routine',
    status: medicationClassificationUncertain
      ? 'needs-data'
      : hasHighRiskMedication
        || hasUnconfirmedOrder
        || hasHeldMedication
        || hasHistoricalMedication
        || veryComplexHealth
        ? 'review'
        : healthStatusMissing || hba1cNeedsUpdate
          ? 'needs-data'
          : 'no-action',
    ...evidence,
    hideNarrative: true,
    title,
    recommendation: text(
      locale,
      medicationClassificationUncertain
        ? '先補齊無法辨識藥品的成分映射；系統完成分類後再判讀，不要求醫師人工重看整張用藥清單。'
        : hasHighRiskMedication
          ? '系統已在有效用藥列表辨識出低血糖高風險藥物。若近期有低血糖或治療負擔大，優先評估減量或簡化該藥。'
          : hasUnconfirmedOrder
            ? '系統找到有效處方，但不能視為病人確實正在使用；先核對實際服用與近期低血糖，再決定是否需要簡化。'
            : hasHeldMedication
              ? '系統找到暫停中的低血糖高風險藥物；先核對暫停原因、是否預計恢復及目前血糖。'
              : hasHistoricalMedication
                ? '系統找到歷史胰島素／磺醯脲處方；先核對近期是否仍使用、最後處方與低血糖事件，不能把歷史紀錄當成現行用藥，也不能當成完全未使用。'
                : healthStatusMissing
                  ? '沒有 insulin／sulfonylurea 只回答了低血糖藥物風險，尚未完成高齡糖尿病目標判讀。請先依共病、ADL／IADL、認知與衰弱分成 healthy、complex／intermediate 或 very complex／poor health。'
                  : veryComplexHealth
                    ? 'very complex／poor health 不應依賴單一 A1c 設定治療強度；以避免低血糖與有症狀高血糖、降低治療負擔及維持功能為主。'
                    : healthStatus === 'complex-intermediate'
                      ? 'complex／intermediate health 的目標需個人化，常以 A1c <8% 為參考；仍需依功能、認知、衰弱、低血糖風險與病人偏好調整。'
                      : '健康、功能與認知完整的高齡者可採較接近一般成人但仍個人化的目標；現有資料未見 insulin／sulfonylurea，不代表要依單一 A1c 加藥或減藥。',
      medicationClassificationUncertain
        ? 'Complete ingredient mapping for the unrecognized medicine first. The system should then rerun classification instead of asking the clinician to reread the entire medication list.'
        : hasHighRiskMedication
          ? 'The system identified a hypoglycemia-prone medicine in the current medication list. If recent hypoglycemia or treatment burden is present, prioritize deintensification or simplification of that medicine.'
          : hasUnconfirmedOrder
            ? 'The system found an active order, which does not confirm actual use. Reconcile use and recent hypoglycemia before deciding whether simplification is needed.'
            : hasHeldMedication
              ? 'The system found a hypoglycemia-prone medicine on hold. Review the reason, whether it may be resumed, and current glycemia.'
              : hasHistoricalMedication
                ? 'The system found a historical insulin/sulfonylurea record. Reconcile current use, the last prescription, and hypoglycemia; history is neither confirmed current use nor proof of nonuse.'
                : healthStatusMissing
                  ? 'Absence of insulin or a sulfonylurea addresses only hypoglycemia-prone medicines; it does not complete goal interpretation. Classify health using comorbidity, ADL/IADL, cognition, and frailty as healthy, complex/intermediate, or very complex/poor health.'
                  : veryComplexHealth
                    ? 'For very complex/poor health, do not rely on A1c alone to set treatment intensity. Prioritize avoidance of hypoglycemia and symptomatic hyperglycemia, lower treatment burden, and preserve function.'
                    : healthStatus === 'complex-intermediate'
                      ? 'For complex/intermediate health, individualize the goal, often using A1c below 8% as a reference, then adjust for function, cognition, frailty, hypoglycemia risk, and preferences.'
                      : 'An older adult with intact health, function, and cognition may use a goal closer to that of younger adults, still individualized. No insulin or sulfonylurea appears, but a single A1c should not trigger automatic treatment changes.',
    ),
    rationale: text(
      locale,
      `${age} 歲；高齡者的 A1c 判讀必須結合健康與功能分層。SGLT2 抑制劑的心腎保護適應症應獨立於 A1c 判斷，不因 HbA1c 6.6% 之類的單一低值自動停藥。`,
      `Age ${age}; A1c interpretation in an older adult requires health and functional stratification. A cardiorenal indication for an SGLT2 inhibitor is assessed independently of A1c and should not be stopped automatically because of a single low value such as 6.6%.`,
    ),
    missingData: [
      ...(healthStatusMissing
        ? [text(
            locale,
            '健康狀態分層：共病負擔、ADL／IADL、認知與衰弱',
            'Health-status classification using comorbidity, ADL/IADL, cognition, and frailty',
          )]
        : []),
      ...(hba1cNeedsUpdate
        ? [text(
            locale,
            `更新 HbA1c（最近一筆已超過 ${hba1cIntervalMonths} 個月）`,
            `Updated HbA1c (the latest result is older than ${hba1cIntervalMonths} months)`,
          )]
        : []),
      ...(medicationClassificationUncertain
      ? [text(locale, '無法辨識藥品的標準成分', 'Standard ingredient for the unrecognized medicine')]
      : hasHighRiskMedication
        ? [text(locale, '近期低血糖事件與個人糖化血色素目標', 'Recent hypoglycemia events and individualized HbA1c target')]
        : hasUnconfirmedOrder
          ? [text(locale, '實際服用情形與近期低血糖事件', 'Actual use and recent hypoglycemia events')]
          : hasHeldMedication
            ? [text(locale, '暫停原因、是否預計恢復與近期低血糖事件', 'Reason for hold, plan to resume, and recent hypoglycemia events')]
            : hasHistoricalMedication
              ? [text(locale, '近期是否持續使用及最後處方後的用藥紀錄', 'Whether use continued and medication records after the last prescription')]
            : []),
    ],
    nextActions: medicationClassificationUncertain
      ? [text(locale, '補上藥品代碼或成分映射後自動重跑。', 'Add the drug-code or ingredient mapping and rerun automatically.')]
      : hasHighRiskMedication
        ? [
            text(locale, '詢問近期低血糖；若有，再優先評估減量或簡化已辨識的高風險藥物。', 'Ask about recent hypoglycemia; if present, prioritize deintensification or simplification of the identified high-risk medicine.'),
          ]
        : hasUnconfirmedOrder
          ? [text(locale, '核對實際服用；若正在使用，再依低血糖與治療負擔評估簡化。', 'Reconcile actual use; if taking it, assess simplification using hypoglycemia and treatment burden.')]
          : hasHeldMedication
            ? [text(locale, '核對暫停原因與恢復計畫，避免未評估即重新啟用。', 'Review the reason for the hold and the restart plan before resuming therapy.')]
            : hasHistoricalMedication
              ? [text(locale, '核對近期實際用藥與低血糖；維持 review，不直接加藥或減藥。', 'Reconcile recent use and hypoglycemia; keep this as review rather than automatically adding or stopping therapy.')]
              : healthStatusMissing
                ? [text(locale, '完成健康、ADL／IADL、認知與衰弱分層後重新判讀個人化目標。', 'Complete health, ADL/IADL, cognition, and frailty stratification, then reinterpret the individualized goal.')]
                : veryComplexHealth
                  ? [text(locale, '以低血糖、症狀性高血糖、治療負擔與照護目標決定是否調整。', 'Use hypoglycemia, symptomatic hyperglycemia, treatment burden, and care goals to decide whether to adjust therapy.')]
            : hba1cNeedsUpdate
              ? [text(locale, '更新 HbA1c；無低血糖事件時，不需針對胰島素／磺醯脲處理。', 'Update HbA1c; if there is no hypoglycemia, no insulin/sulfonylurea action is needed.')]
              : [
                  text(locale, '例行詢問低血糖；無事件時維持現行策略，不需針對胰島素／磺醯脲處理。', 'Ask about hypoglycemia routinely; if none, maintain the current strategy with no insulin/sulfonylurea action.'),
                ],
    guidelineReferences: [{
      id: 'ADA-2026-older-adults',
      title: 'Older Adults: Standards of Care in Diabetes—2026',
      publisher: 'American Diabetes Association',
      version: '2026',
      url: ADA_OLDER_ADULTS_2026_URL,
      recommendationId: '13.7b–13.7c, 13.14b–13.14d',
      summary: text(
        locale,
        '高齡者需在個人化目標內平衡低血糖、治療負擔與心腎保護；當傷害或負擔大於效益時應考慮降階或簡化。',
        'For older adults, balance hypoglycemia and treatment burden within individualized goals while preserving cardiorenal protection; deintensify or simplify when harms or burdens exceed benefits.',
      ),
    }],
    safetyBoundary: text(
      locale,
      '不以單一糖化血色素數值推導固定目標，也不據此自動建議減藥或加藥。',
      'No fixed goal or automatic medication increase/decrease is inferred from a single HbA1c result.',
    ),
  }
}

function buildBloodPressureReview(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const current = isFresh(profile, 'bloodPressure')
  const stale = isStale(profile, 'bloodPressure')
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'bloodPressure', '病歷血壓', 'Charted blood pressure'),
    patientEvidence(profile, locale, 'age', '年齡', 'Age'),
    patientEvidence(profile, locale, 'eGFR', '腎絲球過濾率', 'eGFR'),
  ], ['bloodPressure', 'age', 'eGFR'])

  return {
    id: 'blood-pressure-review',
    domain: 'monitoring',
    priority: current ? 'routine' : 'medium',
    status: current ? 'no-action' : 'needs-data',
    ...evidence,
    hideNarrative: true,
    title: current
      ? text(locale, '血壓紀錄仍在 6 個月時效內', 'The blood pressure record is within its 6-month interval')
      : stale
        ? text(locale, '血壓紀錄已超過 6 個月；本次更新標準化量測', 'The blood pressure record is older than 6 months; obtain a standardized measurement today')
        : text(locale, '本次未取得可判讀血壓；補做標準化量測', 'No interpretable blood pressure is available; obtain a standardized measurement'),
    recommendation: text(
      locale,
      current
        ? '病歷已有時效內血壓；本次仍依例行門診流程量測，不需另列一張決策卡。'
        : '目前沒有時效內血壓可供本次判斷。請用標準方式量測，再結合姿勢性症狀、用藥與個人目標判讀。',
      current
        ? 'A blood pressure within the monitoring interval is available. Continue routine visit measurement without a separate decision card.'
        : 'No blood pressure within the monitoring interval is available for today’s decision. Measure using standard technique and interpret it with orthostatic symptoms, medicines, and the individualized goal.',
    ),
    rationale: text(
      locale,
      '糖尿病合併腎臟病時，血壓是可改變的心腎風險因子；高齡者同時要避免姿勢性低血壓與治療傷害。',
      'In diabetes with kidney disease, blood pressure is a modifiable cardiorenal risk factor; in older adults, orthostatic hypotension and treatment harms must also be avoided.',
    ),
    missingData: current
      ? []
      : [text(locale, '本次標準化血壓、姿勢性症狀與已核對的降壓藥清單', 'Today’s standardized blood pressure, orthostatic symptoms, and reconciled antihypertensive list')],
    nextActions: [
      current
        ? text(locale, '依例行門診流程量測；有症狀或高風險時加測站立血壓。', 'Measure during routine care and add standing blood pressure when symptoms or risk warrant it.')
        : text(locale, '重新取得坐姿標準化血壓；有症狀或高風險時一併評估站立血壓。', 'Obtain a standardized seated blood pressure and assess standing blood pressure when symptoms or risk warrant it.'),
      text(locale, '核對近期多次數值與降壓藥，再依個人目標決定是否需要調整照護。', 'Review repeated recent values and antihypertensive therapy before deciding whether care should change.'),
    ],
    guidelineReferences: [
      taiwanKidneyReference(
        locale,
        'TDA-DKD-2024-blood-pressure',
        text(locale, '第 4 章，頁 49', 'Chapter 4, p. 49'),
        '糖尿病合併慢性腎臟病者應在每次門診以標準方式量測血壓，並依個人情況設定控制策略。',
        'For diabetes with CKD, blood pressure should be measured using a standardized approach at each visit and managed using an individualized strategy.',
      ),
    ],
    safetyBoundary: text(
      locale,
      '不以單一或過期血壓診斷高血壓，也不據此自動調整降壓藥。',
      'A single or outdated blood pressure does not establish hypertension or trigger automatic medication adjustment.',
    ),
  }
}

function buildKidneyMedicationStrategy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const eGfr = numberFromFact(profile, 'eGFR')
  const quantitativeUacrFactKey = profile.facts.urineAlbuminRatioQuantitative
    ? 'urineAlbuminRatioQuantitative'
    : 'urineAlbuminRatio'
  const uacr = numberFromFact(profile, quantitativeUacrFactKey)
  const hasHypertension = Boolean(profile.facts.hypertensionDiagnosis)
  const aceArbState = medicationClassState(profile, 'ace-inhibitor-or-arb')
  const finerenoneState = medicationClassState(profile, 'finerenone')
  const potassium = numberFromFact(profile, 'potassium')
  const aceArbPresent = aceArbState === 'confirmed-current'
  const finerenonePresent = finerenoneState === 'confirmed-current'
  const aceArbContext = profile.medicationClassContexts?.['ace-inhibitor-or-arb']
  const aceArbAllergy = hasDocumentedClassAllergy(profile, 'ace-inhibitor-or-arb')
  const aceArbIndicated = hasHypertension && (
    (uacr !== undefined && uacr >= 30)
    || (eGfr !== undefined && eGfr < 60)
  )
  const finerenoneLabThresholdsMet = (
    aceArbPresent
    && uacr !== undefined
    && uacr > 30
    && eGfr !== undefined
    && eGfr > 25
  )
  const finerenonePotassiumMissing = finerenoneLabThresholdsMet && potassium === undefined
  const finerenonePotassiumTooHigh = (
    finerenoneLabThresholdsMet
    && potassium !== undefined
    && potassium > 5
  )
  const finerenonePotassiumCaution = (
    finerenoneLabThresholdsMet
    && potassium !== undefined
    && potassium > 4.8
    && potassium <= 5
  )
  const finerenoneStageReview = finerenoneLabThresholdsMet && !finerenonePresent
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'kidneyDiagnosis', '腎臟診斷', 'Kidney diagnosis'),
    patientEvidence(profile, locale, 'hypertensionDiagnosis', '高血壓診斷', 'Hypertension'),
    patientEvidence(profile, locale, 'eGFR', '腎絲球過濾率', 'eGFR'),
    patientEvidence(profile, locale, quantitativeUacrFactKey, '最近定量 UACR', 'Latest quantitative UACR'),
    patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
    patientEvidence(profile, locale, 'aceArbTherapy', '系統核對 ACEI／ARB', 'ACE inhibitor/ARB check'),
    patientEvidence(profile, locale, 'aceArbAllergy', '過敏／不耐受核對', 'Allergy/intolerance check'),
    patientEvidence(profile, locale, 'finerenoneTherapy', '系統核對 finerenone', 'Finerenone check'),
  ], ['aceArbTherapy', 'aceArbAllergy', quantitativeUacrFactKey, 'eGFR', 'potassium'])

  const title = aceArbIndicated && aceArbAllergy
    ? text(
        locale,
        'CKD＋高血壓：已記載 ACEI／ARB 過敏／不耐受',
        'CKD with hypertension: ACE inhibitor/ARB allergy or intolerance is documented',
      )
    : aceArbIndicated && aceArbState === 'active-order-unconfirmed'
      ? text(
          locale,
          'CKD＋高血壓：已有 ACEI／ARB 處方，尚未確認實際使用',
          'CKD with hypertension: an ACE inhibitor/ARB order is present; actual use is unconfirmed',
        )
      : aceArbIndicated && aceArbState === 'on-hold'
        ? text(
            locale,
            'CKD＋高血壓：ACEI／ARB 暫停中',
            'CKD with hypertension: ACE inhibitor/ARB therapy is on hold',
          )
        : aceArbIndicated
            && aceArbState === 'historical-record-current-status-unknown'
          ? text(
              locale,
              `CKD＋高血壓：有 ACEI／ARB 歷史處方，近期是否持續未知${aceArbContext?.lastPrescriptionDate ? `（最後處方 ${aceArbContext.lastPrescriptionDate}）` : ''}`,
              `CKD with hypertension: a historical ACE inhibitor/ARB record is present; current use is unknown${aceArbContext?.lastPrescriptionDate ? ` (last prescription ${aceArbContext.lastPrescriptionDate})` : ''}`,
            )
        : aceArbIndicated && !aceArbPresent
    ? text(
        locale,
        'CKD＋高血壓：目前 ACEI／ARB 用藥狀態尚未確認',
        'CKD with hypertension: current ACE inhibitor/ARB use is not established',
      )
    : finerenonePotassiumTooHigh
      ? text(
          locale,
          `finerenone 階段式評估：血鉀 ${potassium} mmol/L，現在不應開始`,
          `Staged finerenone review: potassium ${potassium} mmol/L; do not initiate now`,
        )
      : finerenonePotassiumMissing
        ? text(
            locale,
            'finerenone 階段式評估：先補近期血鉀',
            'Staged finerenone review: obtain a current potassium first',
          )
        : finerenonePotassiumCaution
          ? text(
              locale,
              `finerenone 階段式評估：血鉀 ${potassium} mmol/L，僅在臨床判斷下考慮並加密監測`,
              `Staged finerenone review: potassium ${potassium} mmol/L; consider only with clinical judgment and additional monitoring`,
            )
          : finerenoneStageReview
            ? text(
                locale,
                'finerenone 階段式評估：先確認持續白蛋白尿與最大耐受 RASi',
                'Staged finerenone review: first confirm persistent albuminuria and maximally tolerated RAS inhibition',
              )
      : text(
          locale,
          '腎臟保護用藥已核對；依 eGFR、UACR 與血鉀追蹤',
          'Kidney-protective medications checked; monitor by eGFR, UACR, and potassium',
        )

  return {
    id: 'kidney-medication-strategy',
    domain: 'medication',
    priority: aceArbIndicated && !aceArbPresent ? 'high' : 'medium',
    status: finerenonePotassiumMissing
        ? 'needs-data'
        : 'review',
    ...evidence,
    hideNarrative: true,
    title,
    recommendation: text(
      locale,
      aceArbIndicated && aceArbAllergy
        ? '系統已找到 ACEI／ARB 過敏或不耐受紀錄；先核對反應與可用替代方案，不直接建議開始同類藥物。'
        : aceArbIndicated && aceArbState === 'active-order-unconfirmed'
          ? '系統已找到有效處方，但不能視為病人確實正在使用；先核對實際服用、耐受性與血壓。'
          : aceArbIndicated && aceArbState === 'on-hold'
            ? '系統已找到暫停中的 ACEI／ARB；先核對暫停原因、腎功能、血鉀與恢復計畫。'
            : aceArbIndicated
                && aceArbState === 'historical-record-current-status-unknown'
              ? '系統已找到 ACEI／ARB 歷史處方；先依最後處方日期與用藥資料涵蓋範圍，核對近期是否持續、既往耐受性與停藥原因，不把資料缺口當作未使用。'
            : aceArbIndicated && !aceArbPresent
        ? '現有資料尚未證明目前是否使用 ACEI／ARB；先完成現行與歷史用藥核對、既往耐受與停藥原因確認，不直接形成開始用藥指示。'
        : finerenonePotassiumTooHigh
          ? '目前血鉀 >5.0 mmol/L，依 FDA 標籤不應開始 finerenone；先處理高血鉀並重新評估。'
          : finerenonePotassiumMissing
            ? 'finerenone 只能作階段式提示：先補近期血鉀，並確認 UACR >30 mg/g 為持續性、eGFR >25 mL/min/1.73m²，且已使用最大耐受 RASi。'
            : finerenonePotassiumCaution
              ? '血鉀 >4.8 且 ≤5.0 mmol/L 並非一律禁止；可依臨床判斷考慮，但需確認持續 UACR >30、eGFR >25、最大耐受 RASi，並加密血鉀監測。'
              : finerenoneStageReview
                ? '只有在確認持續 UACR >30 mg/g、eGFR >25 mL/min/1.73m²、正常血鉀及最大耐受 RASi 後，才進入 finerenone 評估；開始後 4 週複查血鉀。'
          : '目前未辨識出需要立即補上的腎臟保護藥物；依 UACR、eGFR、血壓與血鉀持續追蹤。',
      aceArbIndicated && aceArbAllergy
        ? 'The system found an ACE inhibitor/ARB allergy or intolerance record. Verify the reaction and alternatives rather than recommending the same class.'
        : aceArbIndicated && aceArbState === 'active-order-unconfirmed'
          ? 'The system found an active order, which does not confirm actual use. Reconcile use, tolerance, and blood pressure first.'
          : aceArbIndicated && aceArbState === 'on-hold'
            ? 'The system found ACE inhibitor/ARB therapy on hold. Review the reason, kidney function, potassium, and restart plan.'
            : aceArbIndicated
                && aceArbState === 'historical-record-current-status-unknown'
              ? 'A historical ACE inhibitor/ARB prescription is present. Use the last prescription date and medication-data window to reconcile current use, prior tolerance, and the reason it may have stopped rather than treating missing current data as nonuse.'
            : aceArbIndicated && !aceArbPresent
        ? 'The available data do not establish current ACE inhibitor/ARB use. Reconcile current and historical therapy, prior tolerance, and reasons for discontinuation rather than generating an initiation instruction.'
        : finerenonePotassiumTooHigh
          ? 'Current potassium is above 5.0 mmol/L; the FDA label says not to initiate finerenone. Address hyperkalemia and reassess.'
          : finerenonePotassiumMissing
            ? 'Finerenone is only a staged prompt: obtain current potassium and confirm persistent UACR above 30 mg/g, eGFR above 25 mL/min/1.73m², and maximally tolerated RAS inhibition.'
            : finerenonePotassiumCaution
              ? 'Potassium >4.8 and ≤5.0 mmol/L is not an absolute prohibition. It may be considered with clinical judgment only after confirming persistent UACR above 30, eGFR above 25, maximally tolerated RAS inhibition, and additional potassium monitoring.'
              : finerenoneStageReview
                ? 'Proceed to finerenone assessment only after confirming persistent UACR above 30 mg/g, eGFR above 25 mL/min/1.73m², normal potassium, and maximally tolerated RAS inhibition; recheck potassium 4 weeks after initiation.'
          : 'No immediate kidney-protective medication gap was identified; continue follow-up using UACR, eGFR, blood pressure, and potassium.',
    ),
    rationale: text(
      locale,
      '用藥清單由系統分類；是否開始或加藥只保留會改變決策的臨床條件。',
      'The medication list is classified automatically; only clinical conditions that change the decision remain for review.',
    ),
    missingData: aceArbIndicated && aceArbAllergy
      ? [text(locale, '過敏／不耐受反應詳情與可用替代方案', 'Details of the allergy/intolerance and available alternatives')]
      : aceArbIndicated && aceArbState === 'active-order-unconfirmed'
        ? [text(locale, '實際服用情形與耐受性', 'Actual use and tolerance')]
        : aceArbIndicated && aceArbState === 'on-hold'
          ? [text(locale, '暫停原因與是否預計恢復', 'Reason for hold and restart plan')]
          : aceArbIndicated
              && aceArbState === 'historical-record-current-status-unknown'
            ? [text(locale, '目前是否持續、既往耐受性與可能停藥原因', 'Current use, prior tolerance, and possible reason for discontinuation')]
          : aceArbIndicated && !aceArbPresent
      ? [text(locale, '其他禁忌或既往停藥原因', 'Other contraindications or reason for prior discontinuation')]
      : finerenoneStageReview
        ? [
            text(locale, 'UACR >30 mg/g 是否為持續性', 'Whether UACR above 30 mg/g is persistent'),
            text(locale, 'RASi 是否已達最大耐受劑量', 'Whether RAS inhibition is at the maximally tolerated dose'),
            ...(finerenonePotassiumMissing
              ? [text(locale, '近期血鉀', 'Current potassium')]
              : []),
          ]
        : undefined,
    nextActions: aceArbIndicated && aceArbAllergy
      ? [text(locale, '核對反應與嚴重度，依血壓與腎臟風險評估替代治療。', 'Verify the reaction and severity, then assess an alternative using blood pressure and kidney risk.')]
      : aceArbIndicated && aceArbState === 'active-order-unconfirmed'
        ? [text(locale, '核對實際服用與耐受性，再決定維持或調整。', 'Reconcile actual use and tolerance before maintaining or changing therapy.')]
        : aceArbIndicated && aceArbState === 'on-hold'
          ? [text(locale, '核對暫停原因、血鉀與腎功能，再決定是否恢復或改用替代方案。', 'Review the reason for hold, potassium, and kidney function before resuming or choosing an alternative.')]
          : aceArbIndicated
              && aceArbState === 'historical-record-current-status-unknown'
            ? [text(locale, '核對最後處方後是否仍持續、既往耐受性與停藥原因；若重新開始，2–4 週後檢查血壓、creatinine 與血鉀。', 'Reconcile use after the last prescription, prior tolerance, and the reason for discontinuation; if restarted, check blood pressure, creatinine, and potassium in 2–4 weeks.')]
          : aceArbIndicated && !aceArbPresent
      ? [text(locale, '先完成現行與歷史用藥核對，再由臨床人員決定是否開始或重新開始；若開始，2–4 週後檢查血壓、creatinine 與血鉀。', 'Complete current and historical medication reconciliation before a clinician decides whether to initiate or restart; if started, check blood pressure, creatinine, and potassium in 2–4 weeks.')]
      : finerenonePotassiumTooHigh
        ? [text(locale, '現在不要開始 finerenone；先處理高血鉀並複查。', 'Do not initiate finerenone now; address hyperkalemia and repeat potassium.')]
        : finerenoneStageReview
          ? [text(locale, '確認持續 UACR、最大耐受 RASi 與血鉀條件；若開始 finerenone，4 週後複查血鉀。', 'Confirm persistent UACR, maximally tolerated RAS inhibition, and potassium eligibility; if finerenone is started, recheck potassium in 4 weeks.')]
        : [text(locale, '依 CKD 分期追蹤 eGFR、UACR 與血鉀。', 'Monitor eGFR, UACR, and potassium according to CKD stage.')],
    guidelineReferences: [
      {
        id: 'KDIGO-CKD-2024-RASi-monitoring',
        title: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease',
        publisher: 'Kidney Disease: Improving Global Outcomes',
        version: '2024',
        url: `${KDIGO_CKD_2024_URL}#page=49`,
        page: 49,
        recommendationId: 'Practice Points 3.6.2, 3.6.4, and 3.6.7',
        summary: text(
          locale,
          '開始或增加 RASi 後 2–4 週檢查血壓、creatinine 與血鉀；4 週內 creatinine 上升超過 30% 才進一步評估原因；eGFR 低於 30 本身不是停藥理由。',
          'Check blood pressure, creatinine, and potassium 2–4 weeks after starting or increasing RAS inhibition; investigate causes if creatinine rises by more than 30% within 4 weeks; eGFR below 30 alone is not a reason to stop.',
        ),
      },
      ...(finerenoneStageReview
        ? [{
            id: 'FDA-KERENDIA-potassium',
            title: 'KERENDIA (finerenone) Prescribing Information',
            publisher: 'U.S. Food and Drug Administration',
            version: '2025',
            url: `${FDA_KERENDIA_LABEL_URL}#page=5`,
            page: 5,
            recommendationId: 'Section 2.3',
            summary: text(
              locale,
              '血鉀 >5.0 mmol/L 不應開始；>4.8 且 ≤5.0 mmol/L 可依臨床判斷並加密監測；開始或調整劑量後 4 週複查血鉀。',
              'Do not initiate when potassium is above 5.0 mmol/L; >4.8 and ≤5.0 mmol/L may be considered with clinical judgment and additional monitoring; recheck potassium 4 weeks after initiation or dose adjustment.',
            ),
          } satisfies GuidelineReference]
        : []),
    ],
    safetyBoundary: text(
      locale,
      '不因處方清單缺少某藥就自動開藥。ACEI／ARB 開始或重新開始後 2–4 週檢查血壓、creatinine 與血鉀；4 週內 creatinine 上升 >30% 才觸發原因評估，eGFR <30 本身不是停藥理由。',
      'Absence from the medication list does not automatically trigger prescribing. After starting or restarting an ACE inhibitor/ARB, check blood pressure, creatinine, and potassium in 2–4 weeks; evaluate causes when creatinine rises by more than 30% within 4 weeks, and do not stop solely because eGFR is below 30.',
    ),
  }
}

function buildAscvdLipidStrategy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const statinState = medicationClassState(profile, 'statin')
  const statinPresent = statinState === 'confirmed-current'
  const statinAllergy = hasDocumentedClassAllergy(profile, 'statin')
  const age = numberFromFact(profile, 'age')
  const geriatricBenefitReview = (
    (age !== undefined && age >= 85)
    || profile.olderAdultContext?.healthStatus === 'very-complex-poor-health'
    || profile.olderAdultContext?.frailtyStatus === 'frail'
    || profile.olderAdultContext?.cognitiveStatus === 'moderate-to-severe-impairment'
  )
  const statinContext = profile.medicationClassContexts?.statin
  const ldl = numberFromFact(profile, 'LDL')
  const ldlCurrent = ldl !== undefined && isFresh(profile, 'LDL')
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'ascvdDiagnosis', 'ASCVD', 'ASCVD'),
    patientEvidence(profile, locale, 'LDL', 'LDL-C', 'LDL-C'),
    patientEvidence(profile, locale, 'totalCholesterol', '總膽固醇', 'Total cholesterol'),
    patientEvidence(profile, locale, 'statinTherapy', '系統核對 statin', 'Statin check'),
    patientEvidence(profile, locale, 'statinAllergy', '過敏／不耐受核對', 'Allergy/intolerance check'),
  ], ['statinTherapy', 'statinAllergy', 'LDL', 'ascvdDiagnosis'])

  const title = statinPresent
    ? text(
        locale,
        `ASCVD：已確認使用 statin${ldlCurrent ? `；LDL-C ${ldl} mg/dL` : '，待更新 LDL-C'}`,
        `ASCVD: confirmed statin use${ldlCurrent ? `; LDL-C ${ldl} mg/dL` : '; LDL-C update needed'}`,
      )
    : statinState === 'active-order-unconfirmed'
      ? text(
          locale,
          'ASCVD：已有 statin 處方，尚未確認實際使用',
          'ASCVD: a statin order is present; actual use is unconfirmed',
        )
      : statinState === 'on-hold'
        ? text(locale, 'ASCVD：statin 暫停中', 'ASCVD: statin therapy is on hold')
        : statinState === 'historical-record-current-status-unknown'
          ? text(
              locale,
              `ASCVD：有 statin 歷史處方，近期是否持續未知${statinContext?.lastPrescriptionDate ? `（最後處方 ${statinContext.lastPrescriptionDate}）` : ''}`,
              `ASCVD: a historical statin record is present; current use is unknown${statinContext?.lastPrescriptionDate ? ` (last prescription ${statinContext.lastPrescriptionDate})` : ''}`,
            )
        : statinAllergy
          ? text(
              locale,
              'ASCVD：已記載 statin 過敏／不耐受',
              'ASCVD: statin allergy or intolerance is documented',
            )
          : statinState === 'uncertain'
            ? text(
                locale,
                'ASCVD：statin 成分辨識不完整',
                'ASCVD: statin ingredient mapping is incomplete',
              )
            : text(
                locale,
                'ASCVD：現有資料未見 statin',
                'ASCVD: no statin appears in the available medication data',
              )

  const status: CdssRecommendation['status'] = statinPresent
    ? (!ldlCurrent ? 'needs-data' : 'review')
    : statinState === 'not-found' && !statinAllergy
      ? geriatricBenefitReview ? 'review' : 'actionable'
      : statinState === 'uncertain'
        ? 'needs-data'
        : 'review'

  const recommendation = statinPresent
    ? text(
        locale,
        '以 LDL-C 與耐受性判斷是否達次級預防目標；不需再人工核對是否有 statin。',
        'Use LDL-C and tolerance to assess the secondary-prevention goal; manual rechecking for statin exposure is unnecessary.',
      )
    : statinState === 'active-order-unconfirmed'
      ? text(
          locale,
          '有效處方不等於確實服用；先核對實際使用與耐受性，再以 LDL-C 判斷是否達標。',
          'An active order does not confirm use. Reconcile actual use and tolerance, then use LDL-C to assess goal attainment.',
        )
      : statinState === 'on-hold'
        ? text(
            locale,
            '先核對暫停原因與恢復計畫；若無法耐受原強度，評估最大耐受劑量或替代降脂治療。',
            'Review the reason for the hold and restart plan; if the intended intensity is not tolerated, assess the maximum tolerated dose or alternative lipid-lowering therapy.',
          )
        : statinState === 'historical-record-current-status-unknown'
          ? text(
              locale,
              '系統已找到 statin 歷史處方；先依最後處方日期與資料涵蓋範圍核對目前是否持續及既往耐受性，再依預期效益時間、交互作用與照護目標決定最大耐受強度。',
              'A historical statin prescription is present. Reconcile current use and prior tolerance using the last prescription date and data window, then choose the maximum tolerated intensity using time to benefit, interactions, and care goals.',
            )
        : statinAllergy
          ? text(
              locale,
              '先核對過敏／不耐受反應與曾耐受劑量，再評估最大耐受 statin 或非 statin 降脂治療。',
              'Verify the allergy/intolerance and previously tolerated dose, then assess the maximum tolerated statin or nonstatin therapy.',
            )
          : statinState === 'uncertain'
            ? text(
                locale,
                '先完成藥品成分映射，避免把已有 statin 誤判成缺藥。',
                'Complete ingredient mapping first to avoid misclassifying an existing statin as absent.',
              )
            : text(
                locale,
                geriatricBenefitReview
                  ? '糖尿病合併 ASCVD 原則上支持高強度 statin，但本病例需先確認是否仍使用及既往耐受性，再以預期效益時間、交互作用、衰弱／認知與照護目標決定最大耐受強度；不直接形成開始高強度 statin 指示。'
                  : '糖尿病合併 ASCVD 已可評估高強度 statin；LDL-C 用於判斷降幅、達標與後續加藥，不阻擋本次開始評估。',
                geriatricBenefitReview
                  ? 'Diabetes with ASCVD generally supports high-intensity statin therapy, but this case first requires confirmation of current use and prior tolerance. Use time to benefit, interactions, frailty/cognition, and care goals to choose the maximum tolerated intensity rather than generating a direct initiation instruction.'
                  : 'Diabetes with ASCVD is sufficient to assess high-intensity statin therapy. LDL-C is used for response, goal attainment, and add-on therapy and does not block this assessment.',
              )

  return {
    id: 'ascvd-lipid-strategy',
    domain: 'medication',
    priority: statinState === 'not-found' && !statinAllergy && !geriatricBenefitReview
      ? 'high'
      : 'medium',
    status,
    ...evidence,
    hideNarrative: true,
    title,
    recommendation,
    rationale: text(
      locale,
      '病歷已有 ASCVD 診斷；statin 為次級預防核心，LDL-C 才能判斷治療強度與是否達標。',
      'ASCVD is documented. Statin therapy is central to secondary prevention, and LDL-C is required to judge intensity and goal attainment.',
    ),
    missingData: [
      ...(!ldlCurrent
        ? [ldl === undefined
            ? text(locale, 'LDL-C 與採檢日期', 'LDL-C and collection date')
            : text(locale, '更新 LDL-C（最近一筆已超過 1 年）', 'Updated LDL-C (the latest result is older than 1 year)')]
        : []),
      ...(statinState === 'active-order-unconfirmed'
        ? [text(locale, '實際服用情形與耐受性', 'Actual use and tolerance')]
        : statinState === 'on-hold'
          ? [text(locale, '暫停原因與是否預計恢復', 'Reason for hold and restart plan')]
          : statinState === 'historical-record-current-status-unknown'
            ? [text(locale, '目前是否持續、既往耐受性與可能停藥原因', 'Current use, prior tolerance, and possible reason for discontinuation')]
          : statinAllergy
            ? [text(locale, '過敏／不耐受反應詳情與曾耐受劑量', 'Details of the allergy/intolerance and previously tolerated dose')]
            : statinState === 'uncertain'
              ? [text(locale, '無法辨識藥品的標準成分', 'Standard ingredient for the unrecognized medicine')]
              : !statinPresent
                ? [text(
                    locale,
                    geriatricBenefitReview
                      ? '目前是否仍使用、既往耐受性、衰弱／認知、預期效益時間與照護目標'
                      : '其他禁忌或既往停藥原因',
                    geriatricBenefitReview
                      ? 'Current use, prior tolerance, frailty/cognition, time to benefit, and care goals'
                      : 'Other contraindications or reason for prior discontinuation',
                  )]
                : []),
    ],
    nextActions: [
      statinPresent
        ? text(locale, '以 LDL-C 與耐受性決定維持、加強或加入非 statin 治療。', 'Use LDL-C and tolerance to decide whether to maintain, intensify, or add nonstatin therapy.')
        : statinState === 'active-order-unconfirmed'
          ? text(locale, '核對是否實際使用；同時取得 LDL-C 供後續達標判斷。', 'Confirm actual use and obtain LDL-C for subsequent goal assessment.')
          : statinState === 'on-hold'
            ? text(locale, '核對暫停原因，決定恢復最大耐受劑量或改用替代治療。', 'Review the reason for the hold and decide whether to resume the maximum tolerated dose or use an alternative.')
            : statinState === 'historical-record-current-status-unknown'
              ? text(locale, '核對最後處方後是否仍持續與既往耐受性，再依預期效益時間、交互作用及照護目標決定最大耐受強度。', 'Reconcile use after the last prescription and prior tolerance, then choose the maximum tolerated intensity using time to benefit, interactions, and care goals.')
            : statinAllergy
              ? text(locale, '核對反應與嚴重度，評估可耐受 statin 劑量或非 statin 治療。', 'Verify the reaction and severity, then assess a tolerated statin dose or nonstatin therapy.')
              : statinState === 'uncertain'
                ? text(locale, '補上藥品代碼或成分映射後自動重跑。', 'Add the drug code or ingredient mapping and rerun automatically.')
                : text(
                    locale,
                    geriatricBenefitReview
                      ? '先核對目前與歷史用藥及耐受性，再以預期效益時間、交互作用、衰弱／認知與照護目標共同決定最大耐受強度。'
                      : '系統未見 statin 過敏／不耐受；排除其他禁忌後評估高強度 statin，並補 LDL-C。',
                    geriatricBenefitReview
                      ? 'First reconcile current and historical use and tolerance, then choose the maximum tolerated intensity using time to benefit, interactions, frailty/cognition, and care goals.'
                      : 'No statin allergy/intolerance appears in the record; exclude other contraindications, assess high-intensity statin therapy, and obtain LDL-C.',
                  ),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '高齡、衰弱、預期效益時間、交互作用與病人目標會影響強度；本模組不自動開藥。',
      'Age, frailty, time to benefit, interactions, and individual goals affect intensity; this module does not prescribe automatically.',
    ),
  }
}

function buildComplicationScreening(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const items = [
    {
      id: 'retinal-exam' as const,
      factKey: 'retinalExam',
      zh: '眼底',
      en: 'Retinal',
    },
    {
      id: 'neuropathy-exam' as const,
      factKey: 'neuropathyExam',
      zh: '神經',
      en: 'Neuropathy',
    },
    {
      id: 'foot-exam' as const,
      factKey: 'footExam',
      zh: '足部',
      en: 'Foot',
    },
  ].map((item) => ({
    ...item,
    context: profile.screeningContexts?.[item.id],
  }))
  const current = items.filter(({ context }) => context?.state === 'current')
  const due = items.filter(({ context }) => (
    context?.state === 'due' || context?.state === 'overdue'
  ))
  const missing = items.filter(({ context }) => (
    !context || context.state === 'missing'
  ))
  const screeningEvidence = compactEvidence(items.map((item) => patientEvidence(
    profile,
    locale,
    item.factKey,
    item.zh,
    item.en,
  )))
  const status: CdssRecommendation['status'] = missing.length > 0
    ? 'needs-data'
    : due.length > 0
      ? 'actionable'
      : 'no-action'
  const pendingNames = [...due, ...missing]
    .map((item) => text(locale, item.zh, item.en))
    .join('、')

  return {
    id: 'complication-screening',
    domain: 'complication',
    priority: 'routine',
    status,
    overviewEvidenceFactKey: screeningEvidence[0]?.factKeys[0],
    hideNarrative: true,
    title: status === 'no-action'
      ? text(locale, '眼底、神經與足部篩檢均在追蹤時效內', 'Retinal, neuropathy, and foot screening are within their intervals')
      : due.length > 0 && missing.length === 0
        ? text(locale, `併發症篩檢已到期：${pendingNames}`, `Complication screening due: ${pendingNames}`)
        : text(locale, `併發症篩檢待查：${pendingNames}`, `Complication screening to reconcile: ${pendingNames}`),
    recommendation: text(
      locale,
      status === 'no-action'
        ? '系統已依完成日期、結果與足部風險核對追蹤間隔；目前無到期項目。'
        : missing.length > 0
          ? '系統已讀取可辨識的檢查日期與結果；缺少的項目先查完整病歷，確認未完成後再安排。'
          : '系統已依完成日期與風險判定到期；本次安排相應檢查或轉介。',
      status === 'no-action'
        ? 'The system reconciled completion dates, results, and foot risk; no item is currently due.'
        : missing.length > 0
          ? 'The system read recognizable dates and results. Search the full chart for missing items and schedule only after confirming they were not completed.'
          : 'The system determined that follow-up is due using completion dates and risk. Arrange the corresponding examination or referral.',
    ),
    rationale: text(
      locale,
      '眼底依結果採 1–2 年追蹤，神經與一般足部原則每年；高風險足縮短為每次門診／密集追蹤。',
      'Retinal follow-up is one to two years according to findings, neuropathy and routine foot review are annual, and high-risk feet require visit-based or closer follow-up.',
    ),
    patientEvidence: screeningEvidence,
    missingData: missing.map((item) => text(
      locale,
      `${item.zh}最近完成日期與結果`,
      `Latest ${item.en.toLowerCase()} completion date and result`,
    )),
    nextActions: [
      status === 'no-action'
        ? text(locale, `已自動核對 ${current.length} 項；依各自到期日例行追蹤。`, `${current.length} item(s) checked automatically; continue by each due date.`)
        : missing.length > 0
          ? text(locale, `先查完整病歷補齊 ${missing.map((item) => item.zh).join('、')}；已到期項目本次安排。`, `Search the full chart for ${missing.map((item) => item.en.toLowerCase()).join(', ')} and arrange items already due.`)
          : text(locale, `本次安排：${due.map((item) => item.zh).join('、')}。`, `Arrange today: ${due.map((item) => item.en.toLowerCase()).join(', ')}.`),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '本模組只辨識資料缺口與可能到期，不會把缺少資料直接標成併發症，也不取代實際理學檢查。',
      'This module identifies missing or potentially due assessment; it does not convert missing data into a complication diagnosis or replace physical examination.',
    ),
  }
}

function buildOlderAdultSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  age: number,
): CdssRecommendation {
  const evidence = evidenceForOverview([
    patientEvidence(profile, locale, 'age', '年齡', 'Age'),
    patientEvidence(profile, locale, 'HbA1c', '糖化血色素', 'HbA1c'),
    patientEvidence(profile, locale, 'eGFR', '腎絲球過濾率', 'eGFR'),
  ], ['age', 'HbA1c', 'eGFR'])

  return {
    id: 'older-adult-safety',
    domain: 'safety',
    priority: 'medium',
    status: 'needs-data',
    ...evidence,
    hideNarrative: true,
    title: text(locale, '完成高齡糖尿病的認知、功能、衰弱與低血糖安全盤點', 'Complete cognitive, functional, frailty, and hypoglycemia safety review'),
    recommendation: text(
      locale,
      '本次用藥與治療目標決策前，先確認認知、日常功能、跌倒／衰弱、營養、低血糖、照顧者支持及自行服藥能力。',
      'Before medication and target decisions, assess cognition, daily function, falls/frailty, nutrition, hypoglycemia, caregiver support, and ability to self-administer therapy.',
    ),
    rationale: text(
      locale,
      `病人 ${age} 歲；高齡者的治療效益、低血糖風險與執行能力差異很大，這些資訊會直接改變目標與方案複雜度。`,
      `The patient is ${age} years old. Treatment benefit, hypoglycemia risk, and capacity vary substantially in older adults and directly affect goals and regimen complexity.`,
    ),
    missingData: [
      text(locale, '認知與日常／工具性日常活動功能', 'Cognition and basic/instrumental activities of daily living'),
      text(locale, '近期低血糖、跌倒、衰弱、營養與體重變化', 'Recent hypoglycemia, falls, frailty, nutrition, and weight change'),
      text(locale, '照顧者支持與實際自行服藥／監測能力', 'Caregiver support and actual ability to administer medicines and monitor glucose'),
    ],
    nextActions: [
      text(locale, '在本次門診用簡短結構化問題完成安全盤點，必要時由照顧者補充。', 'Complete a brief structured safety review during this visit, with caregiver input when needed.'),
      text(locale, '將結果帶回個人化 HbA1c 目標、低血糖藥物風險與治療簡化決策。', 'Feed the findings into the individualized HbA1c goal, hypoglycemia-risk review, and regimen-simplification decision.'),
    ],
    guidelineReferences: [],
    safetyBoundary: text(
      locale,
      '年齡本身不等於衰弱或認知障礙；未完成評估前不推定能力，也不自動減藥。',
      'Age alone does not establish frailty or cognitive impairment; capacity is not inferred and medicines are not automatically deintensified before assessment.',
    ),
  }
}

export const DM_CKD_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'dm-ckd-cdss',
  diseaseCode: 'DM',
  version: '0.2.0-poc',
  enabled: true,
  label: {
    zh: '糖尿病',
    en: 'Diabetes',
  },
  applies(profile) {
    return profile.eligibleDiseasePackIds?.includes('dm-poc') === true
  },
  build({ profile, locale }) {
    const recommendations: CdssRecommendation[] = []
    const eligibility = profile.diseasePackEligibility?.['dm-poc']
    const diagnosisPending = eligibility?.basis === 'hba1c_diagnostic_range'
    const hasKidneyContext = Boolean(profile.facts.eGFR || profile.facts.eGFRTrend || profile.facts.kidneyDiagnosis)
    const hasQuantitativeUacr = Boolean(
      profile.facts.urineAlbuminRatioQuantitative
      ?? profile.observationContexts?.uacr?.latestQuantitativeReading,
    ) || profile.observationContexts?.uacr?.useState === 'quantitative_comparable'
    const hasForxiga = Boolean(profile.facts.forxiga)
    const hasGovernedCkdEvidence = Boolean(profile.facts.kidneyDiagnosis)
    const age = numberFromFact(profile, 'age')
    const eGfr = numberFromFact(profile, 'eGFR')

    if (diagnosisPending) {
      recommendations.push(buildDiagnosisConfirmation(profile, locale))
    } else {
      recommendations.push(...buildEnabledClinicalModules({ profile, locale }))
      if (hasKidneyContext) {
        recommendations.push(buildKidneyRiskCompletion(profile, locale, hasQuantitativeUacr))
        recommendations.push(buildKidneyMedicationStrategy(profile, locale))
      }
      if (profile.facts.ascvdDiagnosis) {
        recommendations.push(buildAscvdLipidStrategy(profile, locale))
      }
      if (profile.facts.eGFRTrend) {
        recommendations.push(buildEgfrTrajectory(profile, locale))
      }
      if (hasForxiga) {
        recommendations.push(buildSglt2Review(
          profile,
          locale,
          eGfr,
          hasGovernedCkdEvidence,
        ))
      }
      if (profile.facts.HbA1c && age !== undefined && age >= 65) {
        recommendations.push(buildGlycemicSafety(profile, locale, age))
      }
      recommendations.push(buildBloodPressureReview(profile, locale))
      recommendations.push(buildComplicationScreening(profile, locale))
      if (age !== undefined && age >= 65) {
        recommendations.push(buildOlderAdultSafety(profile, locale, age))
      }
    }

    const priorityOrder: Readonly<Record<CdssRecommendation['priority'], number>> = {
      high: 0,
      medium: 1,
      routine: 2,
    }
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    const automatedRecommendations = recommendations.filter((item) => item.status === 'no-action')
    const decisionRecommendations = recommendations.filter((item) => item.status !== 'no-action')
    const enriched = attachKnowledgeAssessments({
      profile,
      locale,
      recommendations: decisionRecommendations,
      sourceIds: ['ada-2026', 'taiwan-t2dm-2022', 'taiwan-nhi-diabetes'],
    })

    const highPriorityCount = enriched.recommendations.filter((item) => item.priority === 'high').length
    const needsDataCount = enriched.recommendations.filter((item) => item.status === 'needs-data').length
    return {
      title: text(locale, '糖尿病個人化照護指引', 'Personalized diabetes care guidance'),
      summary: text(
        locale,
        `本次依病歷產生 ${decisionRecommendations.length} 項決策提示：${highPriorityCount} 項優先處理、${needsDataCount} 項需先補齊或查找資料。`,
        `This run generated ${decisionRecommendations.length} decision prompts: ${highPriorityCount} high priority and ${needsDataCount} requiring data retrieval or completion.`,
      ),
      packId: 'dm-ckd-cdss',
      packVersion: '0.2.0-poc',
      knowledgePacks: enriched.knowledgePacks,
      recommendations: enriched.recommendations,
      automatedChecks: automatedRecommendations.map((item) => {
        const overviewEvidence = item.patientEvidence.find((evidence) => (
          item.overviewEvidenceFactKey
            ? evidence.factKeys.includes(item.overviewEvidenceFactKey)
            : false
        ))
        const displayEvidence = overviewEvidence
          ? [overviewEvidence]
          : item.patientEvidence.slice(0, 1)
        return {
          id: item.id,
          label: item.title,
          value: displayEvidence.length > 0
            ? displayEvidence.map((evidence) => (
                `${evidence.label}：${evidence.value}`
              )).join(' · ')
            : item.nextActions[0],
          factKeys: item.patientEvidence.flatMap((evidence) => evidence.factKeys),
          sources: item.patientEvidence.flatMap((evidence) => evidence.sources ?? []),
        }
      }),
      notEvaluated: [
        text(locale, '本版未計算個別藥物劑量與腎功能調整。', 'This version does not calculate medicine doses or renal dose adjustments.'),
        text(locale, '未取得日期與結果的項目只標示待查找，不會直接判定為照護未完成。', 'Items without dates and results remain pending chart retrieval and are not classified as care not performed.'),
        text(locale, '本版不寫回病歷、不開立醫囑，也不取代完整臨床判斷。', 'This version does not write to the chart, place orders, or replace full clinical judgment.'),
      ],
      disclaimer: text(
        locale,
        'DM CDSS POC｜僅供醫療人員決策支援。所有建議都需核對完整病歷、在地給付與院內規範後再決定。',
        'DM CDSS POC | Clinical decision support only. Verify the full chart, local coverage, and institutional protocols before acting.',
      ),
    }
  },
}
