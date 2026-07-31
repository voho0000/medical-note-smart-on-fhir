import type {
  CdssLocale,
  CdssMedicationClassId,
  CdssPatientProfile,
  CdssRecommendation,
  ClinicalEvidence,
  ClinicalGuidelinePack,
  GuidelineReference,
} from '../types'

const AASLD_PORTAL_HYPERTENSION_URL =
  'https://www.aasld.org/practice-guidelines/portal-hypertension-bleeding-cirrhosis'
const AASLD_HCC_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10663390/'
const AASLD_ASCITES_URL = 'https://doi.org/10.1002/hep.31884'
const AASLD_HE_URL = 'https://www.aasld.org/practice-guidelines/hepatic-encephalopathy'
const AASLD_NUTRITION_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9134787/'
const AASLD_OUTPATIENT_URL =
  'https://www.aasld.org/liver-fellow-network/core-series/back-basics/back-basics-outpatient-management-cirrhosis'
const OPTN_MELD_URL =
  'https://www.hrsa.gov/optn/data-calculators/allocation-calculators/meld-calculator'

const DECOMPENSATION_FACTS = [
  'ascitesDiagnosis',
  'hepaticEncephalopathyDiagnosis',
  'varicealBleedingDiagnosis',
  'spontaneousBacterialPeritonitisDiagnosis',
  'hepatorenalSyndromeDiagnosis',
] as const

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function numberFromFact(
  profile: CdssPatientProfile,
  factKey: string,
): number | undefined {
  const value = profile.facts[factKey]?.numericValue
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function patientEvidence(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  factKey: string,
  labelZh: string,
  labelEn: string,
): ClinicalEvidence | undefined {
  const fact = profile.facts[factKey]
  if (!fact) return undefined
  return {
    label: text(locale, labelZh, labelEn),
    value: fact[locale === 'en' ? 'en' : 'zh'],
    factKeys: [factKey],
    sources: fact.sources,
  }
}

function compactEvidence(
  values: readonly (ClinicalEvidence | undefined)[],
): ClinicalEvidence[] {
  return values.filter((value): value is ClinicalEvidence => Boolean(value))
}

function isConfirmedCurrent(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): boolean {
  return profile.medicationClassContexts?.[classId]?.state === 'confirmed-current'
}

function reference(input: {
  locale: CdssLocale
  id: string
  title: string
  publisher: string
  version: string
  url: string
  recommendationId: string
  locator: string
  summaryZh: string
  summaryEn: string
}): GuidelineReference {
  return {
    id: input.id,
    title: input.title,
    publisher: input.publisher,
    version: input.version,
    url: input.url,
    directLink: true,
    recommendationId: input.recommendationId,
    locator: input.locator,
    summary: text(input.locale, input.summaryZh, input.summaryEn),
  }
}

function portalReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'aasld-portal-hypertension-2024',
    title: 'AASLD Practice Guidance on Risk Stratification and Management of Portal Hypertension and Varices in Cirrhosis',
    publisher: 'American Association for the Study of Liver Diseases',
    version: '2024',
    url: AASLD_PORTAL_HYPERTENSION_URL,
    recommendationId: 'CSPH risk stratification and prevention of decompensation',
    locator: 'Noninvasive CSPH assessment, NSBB use, and endoscopic surveillance',
    summaryZh: '以肝硬度、血小板及已知門脈高壓證據進行風險分層；有 CSPH 時評估非選擇性 β 阻斷劑，不適合經驗性治療者需內視鏡路徑。',
    summaryEn: 'Risk-stratify with liver stiffness, platelets, and established portal-hypertension evidence; assess nonselective beta-blockers for CSPH and use an endoscopic pathway when empiric therapy is unsuitable.',
  })
}

function hccReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'aasld-hcc-2023-surveillance',
    title: 'AASLD Practice Guidance on Prevention, Diagnosis, and Treatment of Hepatocellular Carcinoma',
    publisher: 'American Association for the Study of Liver Diseases',
    version: '2023',
    url: AASLD_HCC_URL,
    recommendationId: 'Guidance statements 10–15',
    locator: 'HCC surveillance and recall algorithm',
    summaryZh: '適合接受治療的肝硬化成人以腹部超音波合併 AFP 每 6 個月監測；可疑病灶 ≥1 cm、AFP ≥20 ng/mL 或持續上升需多期相 CT／MRI 診斷評估。',
    summaryEn: 'Adults with cirrhosis who are candidates for treatment undergo ultrasound plus AFP every 6 months; a suspicious lesion at least 1 cm, AFP at least 20 ng/mL, or rising AFP prompts diagnostic multiphasic CT/MRI.',
  })
}

function ascitesReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'aasld-ascites-sbp-hrs-2021',
    title: 'Diagnosis, Evaluation, and Management of Ascites, Spontaneous Bacterial Peritonitis and Hepatorenal Syndrome',
    publisher: 'American Association for the Study of Liver Diseases',
    version: '2021',
    url: AASLD_ASCITES_URL,
    recommendationId: 'AASLD practice guidance',
    locator: 'Ascites evaluation, renal safety, SBP, HRS, and transplant referral',
    summaryZh: '肝硬化腹水需整合診斷性腹水分析、鈉攝取、利尿劑與腎功能／電解質監測；臨床顯著腹水及相關併發症應考慮肝移植評估。',
    summaryEn: 'Cirrhotic ascites care integrates diagnostic fluid analysis, sodium intake, diuretics, and kidney/electrolyte monitoring; clinically significant ascites and related complications warrant consideration of transplant evaluation.',
  })
}

function encephalopathyReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'aasld-easl-he-2014',
    title: 'Hepatic Encephalopathy in Chronic Liver Disease',
    publisher: 'AASLD / EASL',
    version: '2014',
    url: AASLD_HE_URL,
    recommendationId: 'Treatment and prevention of overt HE',
    locator: 'Clinical diagnosis, precipitant assessment, lactulose, and recurrence prevention',
    summaryZh: '顯性肝性腦病變是臨床診斷，需找出誘發因子；lactulose 為第一線，反覆發作者可在適當情境評估加用 rifaximin。',
    summaryEn: 'Overt hepatic encephalopathy is a clinical diagnosis requiring precipitant evaluation; lactulose is first-line and rifaximin may be assessed in the appropriate recurrent setting.',
  })
}

function nutritionReference(locale: CdssLocale): GuidelineReference {
  return reference({
    locale,
    id: 'aasld-cirrhosis-nutrition-2021',
    title: 'Malnutrition, Frailty, and Sarcopenia in Patients With Cirrhosis',
    publisher: 'American Association for the Study of Liver Diseases',
    version: '2021',
    url: AASLD_NUTRITION_URL,
    recommendationId: 'AASLD practice guidance statements',
    locator: 'Nutrition, frailty, protein intake, and fasting interval',
    summaryZh: '成人肝硬化應評估營養不良、衰弱與肌少症；一般蛋白質目標為理想體重 1.2–1.5 g/kg/day，不因肝性腦病變常規限蛋白，並縮短禁食時間。',
    summaryEn: 'Adults with cirrhosis should be assessed for malnutrition, frailty, and sarcopenia; a usual protein target is 1.2–1.5 g/kg ideal body weight/day without routine protein restriction for HE, while minimizing fasting.',
  })
}

function hasDecompensation(profile: CdssPatientProfile): boolean {
  return DECOMPENSATION_FACTS.some((factKey) => Boolean(profile.facts[factKey]))
}

function buildStageAndReferral(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const decompensated = hasDecompensation(profile)
  const hasHighRiskHistory = Boolean(
    profile.facts.varicealBleedingDiagnosis
    || profile.facts.spontaneousBacterialPeritonitisDiagnosis
    || profile.facts.hepatorenalSyndromeDiagnosis,
  )
  const complicationLabels = DECOMPENSATION_FACTS
    .filter((factKey) => profile.facts[factKey])
    .map((factKey) => {
      const labels: Record<typeof factKey, { zh: string; en: string }> = {
        ascitesDiagnosis: { zh: '腹水', en: 'ascites' },
        hepaticEncephalopathyDiagnosis: { zh: '肝性腦病變', en: 'hepatic encephalopathy' },
        varicealBleedingDiagnosis: { zh: '靜脈曲張出血', en: 'variceal bleeding' },
        spontaneousBacterialPeritonitisDiagnosis: { zh: 'SBP', en: 'SBP' },
        hepatorenalSyndromeDiagnosis: { zh: 'HRS', en: 'HRS' },
      }
      return labels[factKey][locale === 'en' ? 'en' : 'zh']
    })

  return {
    id: 'cirrhosis-stage-referral',
    domain: 'complication',
    priority: hasHighRiskHistory ? 'high' : decompensated ? 'medium' : 'routine',
    status: decompensated ? 'review' : 'needs-data',
    overviewEvidenceFactKey: decompensated
      ? DECOMPENSATION_FACTS.find((factKey) => profile.facts[factKey])
      : 'cirrhosisDiagnosis',
    title: decompensated
      ? text(
          locale,
          `病歷可定位失代償事件：${complicationLabels.join('、')}`,
          `The record contains decompensation events: ${complicationLabels.join(', ')}`,
        )
      : text(
          locale,
          '已有肝硬化診斷，但現有資料不足以確認目前為代償期',
          'Cirrhosis is documented, but the available data cannot establish current compensated status',
        ),
    recommendation: decompensated
      ? text(
          locale,
          '核對每項事件日期、是否仍在活動、治療反應與最近住院；安排肝膽胃腸／肝臟專科追蹤，並依失代償、黃疸、HCC、反覆住院與病人目標評估肝移植中心轉介。',
          'Reconcile each event date, current activity, treatment response, and recent admissions. Arrange gastroenterology/hepatology follow-up and assess transplant-center referral using decompensation, jaundice, HCC, recurrent admissions, and patient goals.',
        )
      : text(
          locale,
          '主動查找腹水、肝性腦病變、胃食道靜脈曲張出血、SBP、HRS、黃疸與 HCC 病史；只有在完整病歷與臨床評估均未見失代償後，才可標記為代償期。',
          'Retrieve histories of ascites, hepatic encephalopathy, gastroesophageal variceal bleeding, SBP, HRS, jaundice, and HCC. Label compensated status only after the complete chart and clinical assessment show no decompensation.',
        ),
    rationale: text(
      locale,
      '腹水、肝性腦病變或門脈高壓性腸胃道出血代表重要的失代償里程碑，會改變預後、用藥安全與轉介優先順序。',
      'Ascites, hepatic encephalopathy, or portal-hypertensive gastrointestinal bleeding is a major decompensation milestone that changes prognosis, medication safety, and referral priority.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'cirrhosisDiagnosis', '肝硬化診斷', 'Cirrhosis diagnosis'),
      patientEvidence(profile, locale, 'ascitesDiagnosis', '腹水', 'Ascites'),
      patientEvidence(profile, locale, 'hepaticEncephalopathyDiagnosis', '肝性腦病變', 'Hepatic encephalopathy'),
      patientEvidence(profile, locale, 'varicealBleedingDiagnosis', '靜脈曲張出血', 'Variceal bleeding'),
      patientEvidence(profile, locale, 'spontaneousBacterialPeritonitisDiagnosis', 'SBP', 'SBP'),
      patientEvidence(profile, locale, 'hepatorenalSyndromeDiagnosis', 'HRS', 'HRS'),
      patientEvidence(profile, locale, 'hepatocellularCarcinomaDiagnosis', 'HCC', 'HCC'),
    ]),
    missingData: [
      text(locale, '目前腹水量、體重變化與周邊水腫', 'Current ascites burden, weight change, and peripheral edema'),
      text(locale, '目前意識、睡眠節律、asterixis 與日常功能', 'Current cognition, sleep pattern, asterixis, and daily function'),
      text(locale, '近期出血、感染、黃疸、住院與肝移植評估狀態', 'Recent bleeding, infection, jaundice, admissions, and transplant-evaluation status'),
    ],
    nextActions: [
      text(locale, '由臨床人員完成代償／失代償分期並指定追蹤責任。', 'Have a clinician establish compensated/decompensated stage and assign follow-up ownership.'),
      ...(decompensated
        ? [text(locale, '評估肝臟專科與肝移植中心轉介時機。', 'Assess timing of hepatology and transplant-center referral.')]
        : []),
    ],
    guidelineReferences: [
      reference({
        locale,
        id: 'aasld-outpatient-cirrhosis-2024',
        title: 'Back to Basics: Outpatient Management of Cirrhosis',
        publisher: 'American Association for the Study of Liver Diseases',
        version: '2024',
        url: AASLD_OUTPATIENT_URL,
        recommendationId: 'Outpatient cirrhosis checklist',
        locator: 'Decompensation definition and transplant referral',
        summaryZh: '腹水、肝性腦病變或靜脈曲張出血界定失代償；失代償或 HCC 病人應由肝臟專科評估進階治療與移植轉介。',
        summaryEn: 'Ascites, hepatic encephalopathy, or variceal bleeding defines decompensation; patients with decompensation or HCC warrant hepatology assessment for advanced therapy and transplant referral.',
      }),
    ],
    safetyBoundary: text(
      locale,
      '診斷碼可能是歷史事件或轉診理由；本模組不把它當成目前急症，也不因資料未見併發症就宣告為代償期。',
      'A diagnosis code may represent history or a referral reason; the module does not treat it as a current emergency and does not declare compensation because complications are absent from the data slice.',
    ),
  }
}

function buildHccSurveillance(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const ultrasoundState = profile.freshnessContexts?.liverUltrasound?.state ?? 'missing'
  const afpState = profile.freshnessContexts?.AFP?.state ?? 'missing'
  const afp = numberFromFact(profile, 'AFP')
  const hasHcc = Boolean(profile.facts.hepatocellularCarcinomaDiagnosis)
  const elevatedAfp = afp !== undefined && afp >= 20
  const surveillanceCurrent = ultrasoundState === 'current' && afpState === 'current'

  return {
    id: 'cirrhosis-hcc-surveillance',
    domain: 'monitoring',
    priority: hasHcc || elevatedAfp ? 'high' : surveillanceCurrent ? 'routine' : 'medium',
    status: hasHcc || elevatedAfp
      ? 'review'
      : surveillanceCurrent
        ? 'no-action'
        : 'actionable',
    overviewEvidenceFactKey: hasHcc
      ? 'hepatocellularCarcinomaDiagnosis'
      : elevatedAfp
        ? 'AFP'
        : 'liverUltrasound',
    title: hasHcc
      ? text(
          locale,
          '已有 HCC 診斷：改走肝癌專科路徑，不再視為一般篩檢',
          'HCC is documented: use the liver-cancer pathway rather than routine surveillance',
        )
      : elevatedAfp
        ? text(
            locale,
            `AFP ${afp} ng/mL：需核對趨勢並進行診斷性影像評估`,
            `AFP ${afp} ng/mL: verify the trend and pursue diagnostic imaging assessment`,
          )
        : surveillanceCurrent
          ? text(
              locale,
              '近 6 個月可定位超音波與 AFP 紀錄',
              'Ultrasound and AFP records are locatable within the past 6 months',
            )
          : text(
              locale,
              'HCC 每 6 個月監測尚未形成可確認的閉環',
              'The 6-month HCC surveillance loop is not confirmed as complete',
            ),
    recommendation: hasHcc
      ? text(
          locale,
          '核對腫瘤影像、LI-RADS／病理、分期與治療狀態，交由肝癌多專科團隊與肝移植團隊依適應症評估。',
          'Reconcile tumor imaging, LI-RADS/pathology, stage, and treatment status, then route to a multidisciplinary liver-cancer team and transplant team when indicated.',
        )
      : elevatedAfp
        ? text(
            locale,
            '先確認 AFP 單位、採檢日期與連續趨勢；依 AASLD recall 路徑，由臨床人員安排多期相增強 CT 或 MRI。AFP 單獨不能診斷 HCC。',
            'Confirm AFP units, collection date, and serial trend. A clinician should follow the AASLD recall pathway with multiphasic contrast-enhanced CT or MRI. AFP alone cannot diagnose HCC.',
          )
        : text(
            locale,
            '確認最近一次檢查確為品質足夠的肝癌監測超音波且報告已回看，並搭配 AFP；若任一項超過 6 個月或缺少，依院內流程補齊並指定結果回看責任。',
            'Confirm that the latest examination was an adequately visualized HCC-surveillance ultrasound with result review and paired AFP. If either is older than 6 months or missing, complete it through the institutional workflow and assign result ownership.',
          ),
    rationale: text(
      locale,
      '肝硬化是 HCC 高風險狀態；半年一次監測可提高早期發現機會，但檢查紀錄不等於影像品質、陰性結果或已完成回看。',
      'Cirrhosis confers high HCC risk. Semiannual surveillance improves early detection, but a procedure record does not establish imaging quality, a negative result, or completed result review.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'cirrhosisDiagnosis', '肝硬化', 'Cirrhosis'),
      patientEvidence(profile, locale, 'liverUltrasound', '超音波候選紀錄', 'Ultrasound candidate record'),
      patientEvidence(profile, locale, 'AFP', 'AFP', 'AFP'),
      patientEvidence(profile, locale, 'hepatocellularCarcinomaDiagnosis', 'HCC', 'HCC'),
    ]),
    missingData: [
      ...(profile.facts.liverUltrasound
        ? [text(locale, '超音波監測適應症、肝臟可視化品質與完整報告', 'Ultrasound indication, liver-visualization quality, and complete report')]
        : [text(locale, '近 6 個月肝臟超音波', 'Liver ultrasound within 6 months')]),
      ...(!profile.facts.AFP
        ? [text(locale, '近 6 個月 AFP', 'AFP within 6 months')]
        : []),
      text(locale, '是否適合接受 HCC 治療；Child-Pugh C 若非移植候選者需個別決定監測效益', 'Candidacy for HCC treatment; individualize surveillance benefit for Child-Pugh C patients who are not transplant candidates'),
      text(locale, '檢查結果回看與後續責任人', 'Result review and follow-up owner'),
    ],
    nextActions: [
      hasHcc || elevatedAfp
        ? text(locale, '依診斷性影像／肝癌多專科路徑處理，不以重複 AFP 取代影像。', 'Use the diagnostic-imaging/liver-tumor pathway; do not substitute repeated AFP for imaging.')
        : text(locale, '補齊或核對 US＋AFP 半年監測並記錄下一次到期日。', 'Complete or verify semiannual ultrasound plus AFP and record the next due date.'),
    ],
    guidelineReferences: [hccReference(locale)],
    safetyBoundary: text(
      locale,
      'AFP 正常不能排除 HCC；AFP 升高也不能單獨確診。一般腹部超音波的申報紀錄不自動等同品質足夠的 HCC 監測；Child-Pugh C 且非移植候選者不會由本模組自動排程監測。',
      'A normal AFP does not exclude HCC, and an elevated AFP does not establish it. A billed abdominal ultrasound is not automatically treated as adequate HCC surveillance; the module does not automatically schedule surveillance for Child-Pugh C patients who are not transplant candidates.',
    ),
  }
}

function buildPortalHypertension(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const stiffness = numberFromFact(profile, 'liverStiffness')
  const platelets = numberFromFact(profile, 'plateletCount')
  const hasVarices = Boolean(profile.facts.esophagealVaricesDiagnosis)
  const hasPortalHypertension = Boolean(profile.facts.portalHypertensionDiagnosis)
  const cspHSignal = hasVarices || hasPortalHypertension || (
    stiffness !== undefined && stiffness >= 25
  )
  const nsbbCurrent = isConfirmedCurrent(profile, 'nonselective-beta-blocker')
  const hasEndoscopy = Boolean(profile.facts.upperEndoscopy)

  return {
    id: 'cirrhosis-portal-hypertension',
    domain: 'complication',
    priority: cspHSignal && !nsbbCurrent ? 'high' : 'medium',
    status: cspHSignal
      ? 'review'
      : stiffness === undefined || platelets === undefined
        ? 'needs-data'
        : 'review',
    overviewEvidenceFactKey: hasVarices
      ? 'esophagealVaricesDiagnosis'
      : hasPortalHypertension
        ? 'portalHypertensionDiagnosis'
        : stiffness !== undefined
          ? 'liverStiffness'
          : 'plateletCount',
    title: cspHSignal
      ? nsbbCurrent
        ? text(
            locale,
            '已有門脈高壓證據，且辨識到目前使用非選擇性 β 阻斷劑',
            'Portal-hypertension evidence is present and current nonselective beta-blocker use is identified',
          )
        : text(
            locale,
            '已有門脈高壓／CSPH 證據，需完成出血與失代償預防決策',
            'Portal-hypertension/CSPH evidence is present and prevention decisions require completion',
          )
      : text(
          locale,
          '需以肝硬度、血小板與內視鏡／影像資料完成門脈高壓風險分層',
          'Portal-hypertension risk stratification needs liver stiffness, platelets, and endoscopic/imaging data',
        ),
    recommendation: cspHSignal
      ? text(
          locale,
          nsbbCurrent
            ? '核對藥名、實際服用、適應症、血壓／心率、腎功能與耐受性；非選擇性 β 阻斷劑使用中通常不需為單純篩檢重複 EGD，但既往出血或結紮後追蹤須依專屬時程。'
            : '由肝臟專科評估非選擇性 β 阻斷劑是否適合用於預防失代償／靜脈曲張出血；若有禁忌、不耐受或不適合經驗性治療，進入 EGD 風險分層與監測路徑。',
          nsbbCurrent
            ? 'Reconcile drug, actual use, indication, BP/heart rate, kidney function, and tolerance. Patients taking an NSBB generally do not need repeated EGD solely for screening, while prior bleeding or post-banding surveillance follows a dedicated schedule.'
            : 'Have hepatology assess whether a nonselective beta-blocker is appropriate to prevent decompensation/variceal bleeding. If contraindicated, not tolerated, or unsuitable for empiric therapy, use the EGD risk-stratification and surveillance pathway.',
        )
      : text(
          locale,
          '查找近期 transient elastography 與血小板，並核對影像或 EGD 是否已有 varices／側枝循環／portal hypertensive gastropathy。不要只用低血小板自動診斷 CSPH 或啟動藥物。',
          'Retrieve recent transient elastography and platelets and check imaging or EGD for varices, collaterals, or portal-hypertensive gastropathy. Do not diagnose CSPH or start therapy from thrombocytopenia alone.',
        ),
    rationale: text(
      locale,
      'CSPH 是代償期進入失代償的重要風險節點；非侵入性條件與既有門脈高壓證據可引導 NSBB 或 EGD 路徑。',
      'CSPH is a major transition risk from compensated to decompensated cirrhosis; noninvasive criteria and established portal-hypertension evidence guide NSBB or EGD pathways.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'portalHypertensionDiagnosis', '門脈高壓', 'Portal hypertension'),
      patientEvidence(profile, locale, 'esophagealVaricesDiagnosis', '胃食道靜脈曲張', 'Gastroesophageal varices'),
      patientEvidence(profile, locale, 'liverStiffness', '肝硬度', 'Liver stiffness'),
      patientEvidence(profile, locale, 'plateletCount', '血小板', 'Platelets'),
      patientEvidence(profile, locale, 'upperEndoscopy', '最近 EGD', 'Latest EGD'),
      patientEvidence(profile, locale, 'nonselectiveBetaBlockerTherapy', '非選擇性 β 阻斷劑', 'Nonselective beta-blocker'),
      patientEvidence(profile, locale, 'bloodPressure', '血壓', 'Blood pressure'),
      patientEvidence(profile, locale, 'heartRate', '心率', 'Heart rate'),
    ]),
    missingData: [
      ...(stiffness === undefined
        ? [text(locale, '近期 transient elastography 肝硬度', 'Recent transient-elastography liver stiffness')]
        : []),
      ...(platelets === undefined
        ? [text(locale, '近期血小板', 'Recent platelet count')]
        : []),
      ...(!hasEndoscopy
        ? [text(locale, '既往 EGD 結果與是否曾結紮', 'Prior EGD findings and banding history')]
        : [text(locale, '完整 EGD 結果、varix 大小與後續時程', 'Complete EGD result, varix size, and follow-up schedule')]),
      text(locale, '目前血壓、心率、腎功能及 NSBB 禁忌／耐受性', 'Current BP, heart rate, kidney function, and NSBB contraindications/tolerance'),
    ],
    nextActions: [
      text(locale, '由肝臟專科確認 CSPH 狀態並選擇 NSBB 或 EGD 路徑。', 'Have hepatology confirm CSPH status and select the NSBB or EGD pathway.'),
    ],
    guidelineReferences: [portalReference(locale)],
    safetyBoundary: text(
      locale,
      'LSM ≥25 kPa 的 rule-in 條件受病因、BMI、發炎與檢查品質影響；低血小板也有其他原因。本模組不自動開立或停用 NSBB。',
      'The LSM ≥25 kPa rule-in criterion is affected by etiology, BMI, inflammation, and examination quality, and thrombocytopenia has other causes. The module never starts or stops an NSBB automatically.',
    ),
  }
}

function buildAscitesSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  if (!profile.facts.ascitesDiagnosis) return undefined

  const hasNsaid = Boolean(profile.facts.currentNsaid)
  const hasAceArb = isConfirmedCurrent(profile, 'ace-inhibitor-or-arb')
  const hasLoop = isConfirmedCurrent(profile, 'loop-diuretic')
  const hasMra = isConfirmedCurrent(profile, 'mineralocorticoid-receptor-antagonist')

  return {
    id: 'cirrhosis-ascites-kidney-safety',
    domain: 'safety',
    priority: hasNsaid || Boolean(profile.facts.hepatorenalSyndromeDiagnosis) ? 'high' : 'medium',
    status: 'review',
    overviewEvidenceFactKey: hasNsaid ? 'currentNsaid' : 'ascitesDiagnosis',
    title: hasNsaid
      ? text(
          locale,
          '腹水病史同時辨識到可能的 NSAID：優先完成腎灌流與用藥安全核對',
          'A possible NSAID appears with ascites: prioritize kidney-perfusion and medication-safety review',
        )
      : text(
          locale,
          '腹水照護需核對容量、腎功能、電解質、利尿劑與 SBP 風險',
          'Ascites care requires reconciliation of volume status, kidney function, electrolytes, diuretics, and SBP risk',
        ),
    recommendation: text(
      locale,
      '確認目前是否有腹水與嚴重度；新發或住院腹水依情境評估診斷性腹水穿刺。若為臨床顯著腹水，個人化討論鈉 <2 g/day、每日體重與 spironolactone／loop 利尿劑策略，並以血壓、creatinine、sodium、potassium 與症狀調整。核對並避免 NSAID；ACEI／ARB 在腹水時可能降低腎灌流，需由臨床人員重新權衡。',
      'Confirm whether ascites is currently present and its severity; assess diagnostic paracentesis for new-onset or hospitalized ascites as clinically appropriate. For clinically significant ascites, individualize sodium below 2 g/day, daily weights, and spironolactone/loop-diuretic strategy using BP, creatinine, sodium, potassium, and symptoms. Reconcile and avoid NSAIDs; ACE inhibitors/ARBs may reduce renal perfusion in ascites and require clinician reassessment.',
    ),
    rationale: text(
      locale,
      '肝硬化腹水容易合併低血鈉、AKI、感染與 HRS；處方／申報紀錄無法取代當下容量狀態與實際服藥核對。',
      'Cirrhotic ascites predisposes to hyponatremia, AKI, infection, and HRS. Prescription/claim records cannot replace current volume assessment or actual-use reconciliation.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'ascitesDiagnosis', '腹水', 'Ascites'),
      patientEvidence(profile, locale, 'spontaneousBacterialPeritonitisDiagnosis', 'SBP', 'SBP'),
      patientEvidence(profile, locale, 'hepatorenalSyndromeDiagnosis', 'HRS', 'HRS'),
      patientEvidence(profile, locale, 'currentNsaid', '可能 NSAID', 'Possible NSAID'),
      patientEvidence(profile, locale, 'aceArbTherapy', 'ACEI／ARB', 'ACE inhibitor/ARB'),
      patientEvidence(profile, locale, 'mraTherapy', 'Spironolactone／MRA', 'Spironolactone/MRA'),
      patientEvidence(profile, locale, 'loopDiureticTherapy', 'Loop 利尿劑', 'Loop diuretic'),
      patientEvidence(profile, locale, 'serumCreatinine', 'Creatinine', 'Creatinine'),
      patientEvidence(profile, locale, 'sodium', 'Sodium', 'Sodium'),
      patientEvidence(profile, locale, 'potassium', 'Potassium', 'Potassium'),
      patientEvidence(profile, locale, 'bodyWeight', '體重', 'Body weight'),
    ]),
    missingData: [
      text(locale, '目前腹水分級、每日體重、血壓與尿量', 'Current ascites grade, daily weight, BP, and urine output'),
      text(locale, '腹水 PMN、培養、albumin／total protein 與既往 SBP', 'Ascitic PMN, culture, albumin/total protein, and prior SBP'),
      text(locale, '實際鈉攝取、實際服藥、利尿反應與副作用', 'Actual sodium intake, medication use, diuretic response, and adverse effects'),
    ],
    nextActions: [
      ...(hasNsaid
        ? [text(locale, '由醫師或藥師即時核對 NSAID 實際使用並決定處置。', 'Have a clinician or pharmacist promptly verify actual NSAID use and decide management.')]
        : []),
      text(locale, '建立體重、腎功能、sodium／potassium 與腹水症狀的追蹤計畫。', 'Establish follow-up for weight, kidney function, sodium/potassium, and ascites symptoms.'),
      ...(!hasLoop && !hasMra
        ? [text(locale, '若目前確有需治療腹水，由臨床人員評估利尿劑與穿刺策略。', 'If treatment-requiring ascites is currently present, have a clinician assess diuretic and paracentesis strategies.')]
        : []),
      ...(hasAceArb
        ? [text(locale, '重新權衡 ACEI／ARB 的適應症、血壓與腎灌流風險。', 'Reassess the ACE inhibitor/ARB indication against BP and renal-perfusion risk.')]
        : []),
    ],
    guidelineReferences: [ascitesReference(locale)],
    safetyBoundary: text(
      locale,
      '腹水診斷碼不表示目前一定有可穿刺腹水；本模組不自動停藥、調整利尿劑或判定 SBP 預防性抗生素適應症。',
      'An ascites code does not establish current drainable fluid. The module does not stop drugs, adjust diuretics, or determine SBP-antibiotic prophylaxis automatically.',
    ),
  }
}

function buildEncephalopathy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  if (!profile.facts.hepaticEncephalopathyDiagnosis) return undefined

  const lactuloseCurrent = isConfirmedCurrent(profile, 'lactulose')
  const rifaximinCurrent = isConfirmedCurrent(profile, 'rifaximin')
  return {
    id: 'cirrhosis-hepatic-encephalopathy',
    domain: 'complication',
    priority: 'high',
    status: 'review',
    overviewEvidenceFactKey: 'hepaticEncephalopathyDiagnosis',
    title: text(
      locale,
      '有肝性腦病變病史：先確認目前認知狀態、誘發因子與預防治療',
      'Hepatic encephalopathy is documented: confirm current cognition, precipitants, and recurrence prevention',
    ),
    recommendation: text(
      locale,
      '立即詢問病人與照顧者是否有定向力改變、嗜睡、asterixis、跌倒或無法安全自理；明顯意識改變需急性醫療評估。若使用 lactulose，核對實際劑量並依臨床計畫調整至每日約 2–3 次軟便，避免過度腹瀉與脫水；反覆發作時由肝臟專科評估 rifaximin 與誘發因子控制。',
      'Ask the patient and caregiver about disorientation, somnolence, asterixis, falls, or inability to function safely; overt mental-status change requires acute medical assessment. If lactulose is used, reconcile the actual dose and titrate under the clinical plan to about 2–3 soft stools/day while avoiding diarrhea and dehydration. For recurrent episodes, have hepatology assess rifaximin and precipitant control.',
    ),
    rationale: text(
      locale,
      '肝性腦病變是臨床診斷，感染、腸胃道出血、便祕、脫水、電解質異常、腎功能惡化與鎮靜藥物都可能誘發或加重。',
      'Hepatic encephalopathy is a clinical diagnosis; infection, gastrointestinal bleeding, constipation, dehydration, electrolyte abnormalities, kidney deterioration, and sedating drugs may precipitate or worsen it.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'hepaticEncephalopathyDiagnosis', '肝性腦病變', 'Hepatic encephalopathy'),
      patientEvidence(profile, locale, 'lactuloseTherapy', 'Lactulose', 'Lactulose'),
      patientEvidence(profile, locale, 'rifaximinTherapy', 'Rifaximin', 'Rifaximin'),
      patientEvidence(profile, locale, 'sodium', 'Sodium', 'Sodium'),
      patientEvidence(profile, locale, 'potassium', 'Potassium', 'Potassium'),
      patientEvidence(profile, locale, 'serumCreatinine', 'Creatinine', 'Creatinine'),
    ]),
    missingData: [
      text(locale, '目前 West Haven 分級、認知／功能基線與照顧者觀察', 'Current West Haven grade, cognitive/functional baseline, and caregiver observations'),
      text(locale, '排便頻率與性狀、lactulose 實際服用與耐受性', 'Stool frequency/consistency and actual lactulose use/tolerance'),
      text(locale, '感染、出血、便祕、脫水、電解質、腎功能與鎮靜藥物', 'Infection, bleeding, constipation, dehydration, electrolytes, kidney function, and sedating medications'),
      ...(!rifaximinCurrent
        ? [text(locale, '是否曾反覆發作或因 HE 住院', 'Recurrent episodes or HE-related admissions')]
        : []),
    ],
    nextActions: [
      text(locale, '有目前意識或功能改變時，立即由臨床人員評估急性病因與照護場域。', 'If mental status or function is currently changed, obtain immediate clinical assessment of acute causes and care setting.'),
      lactuloseCurrent
        ? text(locale, '核對 lactulose 目標、排便與脫水風險。', 'Reconcile the lactulose target, bowel output, and dehydration risk.')
        : text(locale, '核對過去治療與停藥原因，再由臨床人員決定第一線治療。', 'Reconcile prior treatment and reasons for discontinuation before a clinician selects first-line therapy.'),
    ],
    guidelineReferences: [encephalopathyReference(locale)],
    safetyBoundary: text(
      locale,
      '血氨值不會被本模組單獨用來診斷、分級或排除 HE；既往診斷碼也不等於目前正在發作。',
      'The module never uses ammonia alone to diagnose, grade, or exclude HE, and a historical code does not establish a current episode.',
    ),
  }
}

function buildSeverityMonitoring(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const required = [
    ['totalBilirubin', 'total bilirubin'],
    ['INR', 'INR'],
    ['serumCreatinine', 'creatinine'],
    ['sodium', 'sodium'],
    ['albumin', 'albumin'],
  ] as const
  const missing = required.filter(([factKey]) => !profile.facts[factKey])
  const dates = required
    .map(([factKey]) => profile.facts[factKey]?.date)
    .filter((date): date is string => Boolean(date))
  const sameDate = dates.length === required.length && new Set(dates).size === 1
  const concerning = Boolean(
    (numberFromFact(profile, 'totalBilirubin') ?? 0) >= 3
    || (numberFromFact(profile, 'INR') ?? 0) >= 1.5
    || (numberFromFact(profile, 'serumCreatinine') ?? 0) >= 1.5
    || (numberFromFact(profile, 'sodium') ?? 999) <= 130
    || (numberFromFact(profile, 'albumin') ?? 999) < 3,
  )

  return {
    id: 'cirrhosis-severity-monitoring',
    domain: 'monitoring',
    priority: concerning ? 'high' : missing.length > 0 ? 'medium' : 'routine',
    status: concerning ? 'review' : missing.length > 0 || !sameDate ? 'needs-data' : 'review',
    overviewEvidenceFactKey: concerning
      ? required.find(([factKey]) => {
          const value = numberFromFact(profile, factKey)
          return value !== undefined && (
            (factKey === 'totalBilirubin' && value >= 3)
            || (factKey === 'INR' && value >= 1.5)
            || (factKey === 'serumCreatinine' && value >= 1.5)
            || (factKey === 'sodium' && value <= 130)
            || (factKey === 'albumin' && value < 3)
          )
        })?.[0]
      : 'totalBilirubin',
    title: concerning
      ? text(
          locale,
          '可見肝／腎嚴重度異常：需核對同批檢驗與臨床狀態',
          'A liver/kidney severity abnormality is visible: verify the same-draw laboratory set and clinical status',
        )
      : missing.length > 0
        ? text(
            locale,
            `MELD 3.0 監測輸入尚缺 ${missing.length} 項`,
            `${missing.length} MELD 3.0 monitoring input(s) are missing`,
          )
        : sameDate
          ? text(
              locale,
              `可定位同日嚴重度檢驗組（${dates[0]}），需以正式流程計算`,
              `A same-day severity laboratory set is locatable (${dates[0]}); calculate through the formal workflow`,
            )
          : text(
              locale,
              '嚴重度檢驗來自不同日期，不應拼接成 MELD 3.0',
              'Severity laboratories come from different dates and should not be combined into MELD 3.0',
            ),
    recommendation: text(
      locale,
      '取得同一臨床時間點的 total bilirubin、INR、creatinine、sodium、albumin，並確認年齡、MELD 計算用 sex 與過去 7 天透析狀態，再使用正式 OPTN／院內計算器。同步以趨勢與臨床失代償判斷急迫性，不只看單一分數。',
      'Obtain total bilirubin, INR, creatinine, sodium, and albumin from the same clinical time point and verify age, sex for MELD calculation, and dialysis in the prior 7 days before using the official OPTN/institutional calculator. Use trends and clinical decompensation—not one score alone—to determine urgency.',
    ),
    rationale: text(
      locale,
      'MELD 3.0 依賴受上下限與透析規則約束的同步輸入；跨日期拼接、一般性別欄位或漏掉透析會產生錯誤的精確感。',
      'MELD 3.0 depends on synchronized inputs governed by bounds and dialysis rules. Combining dates, using a generic sex field, or missing dialysis creates false precision.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'totalBilirubin', 'Total bilirubin', 'Total bilirubin'),
      patientEvidence(profile, locale, 'INR', 'INR', 'INR'),
      patientEvidence(profile, locale, 'serumCreatinine', 'Creatinine', 'Creatinine'),
      patientEvidence(profile, locale, 'sodium', 'Sodium', 'Sodium'),
      patientEvidence(profile, locale, 'albumin', 'Albumin', 'Albumin'),
      patientEvidence(profile, locale, 'plateletCount', '血小板', 'Platelets'),
    ]),
    missingData: [
      ...missing.map(([, label]) => label),
      text(locale, '過去 7 天透析／連續性腎臟替代治療', 'Dialysis/continuous kidney replacement therapy in the prior 7 days'),
      text(locale, 'MELD 計算用 sex 與同批採檢確認', 'Sex for MELD calculation and same-draw verification'),
      text(locale, 'Child-Pugh 所需的腹水與 HE 臨床分級', 'Clinical ascites and HE grading required for Child-Pugh'),
    ],
    nextActions: [
      text(locale, '補齊同批檢驗後以正式計算器記錄 MELD 3.0 與計算日期。', 'After completing a same-draw set, record MELD 3.0 and its calculation date using the official calculator.'),
      ...(concerning
        ? [text(locale, '依症狀、趨勢與失代償狀態決定是否需同日評估。', 'Use symptoms, trends, and decompensation status to decide whether same-day assessment is required.')]
        : []),
    ],
    guidelineReferences: [
      reference({
        locale,
        id: 'optn-meld-3-calculator',
        title: 'OPTN MELD Calculator',
        publisher: 'Organ Procurement and Transplantation Network / HRSA',
        version: 'Reviewed December 2025',
        url: OPTN_MELD_URL,
        recommendationId: 'MELD 3.0 inputs',
        locator: 'Official allocation calculator and input definitions',
        summaryZh: 'MELD 3.0 使用 creatinine、bilirubin、INR、sodium、albumin、年齡與計算用 sex，並對近期透析套用 creatinine 規則。',
        summaryEn: 'MELD 3.0 uses creatinine, bilirubin, INR, sodium, albumin, age, and sex for calculation, with a creatinine rule for recent dialysis.',
      }),
    ],
    safetyBoundary: text(
      locale,
      '本模組刻意不由跨日健康存摺資料自動產生 MELD 或 Child-Pugh 分數；正式移植排序、例外分數與轉介決策只能由專科流程完成。',
      'The module intentionally does not generate MELD or Child-Pugh from cross-date My Health Bank data. Formal transplant allocation, exception points, and referral decisions require specialist workflows.',
    ),
  }
}

function buildNutritionAndPrevention(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const missingVaccines = [
    ['influenza-vaccine', '流感', 'influenza'],
    ['covid-vaccine', 'COVID-19', 'COVID-19'],
    ['pneumococcal-vaccine', '肺炎鏈球菌', 'pneumococcal'],
  ].filter(([screeningId]) => (
    profile.screeningContexts?.[screeningId as keyof NonNullable<CdssPatientProfile['screeningContexts']>]?.state
    !== 'current'
  ))

  return {
    id: 'cirrhosis-nutrition-prevention',
    domain: 'care-gap',
    priority: 'routine',
    status: 'needs-data',
    overviewEvidenceFactKey: 'bodyWeight',
    title: text(
      locale,
      '營養、肌少症與疫苗仍需個人化盤點',
      'Nutrition, sarcopenia, and immunizations still need individualized review',
    ),
    recommendation: text(
      locale,
      '使用可重複的營養／衰弱工具與乾體重評估，通常以理想體重蛋白質 1.2–1.5 g/kg/day 為起點，不因 HE 常規限蛋白；避免長時間禁食並評估睡前點心。依血清學、病史與本地時程補齊 hepatitis A／B、流感、COVID-19、肺炎鏈球菌及其他適齡疫苗。',
      'Use repeatable nutrition/frailty tools and dry weight. A usual starting protein target is 1.2–1.5 g/kg ideal body weight/day without routine protein restriction for HE; minimize prolonged fasting and assess a late-evening snack. Use serology, history, and local schedules to complete hepatitis A/B, influenza, COVID-19, pneumococcal, and other age-appropriate vaccines.',
    ),
    rationale: text(
      locale,
      '肝硬化常伴隨未被辨識的營養不良、衰弱與肌少症；腹水體重不能直接當作營養體重，且疫苗紀錄缺少不等於未接種。',
      'Cirrhosis commonly includes underrecognized malnutrition, frailty, and sarcopenia. Ascites weight is not the nutritional dry weight, and an absent vaccine record does not prove nonvaccination.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'bodyWeight', '最近體重', 'Latest weight'),
      patientEvidence(profile, locale, 'albumin', 'Albumin', 'Albumin'),
      patientEvidence(profile, locale, 'influenzaVaccine', '流感疫苗', 'Influenza vaccine'),
      patientEvidence(profile, locale, 'covidVaccine', 'COVID-19 疫苗', 'COVID-19 vaccine'),
      patientEvidence(profile, locale, 'pneumococcalVaccine', '肺炎鏈球菌疫苗', 'Pneumococcal vaccine'),
    ]),
    missingData: [
      text(locale, '乾體重、BMI、近 6 個月非預期體重變化與實際攝取', 'Dry weight, BMI, 6-month unintentional weight change, and actual intake'),
      text(locale, 'Liver Frailty Index／握力／chair stands 與肌少症評估', 'Liver Frailty Index/handgrip/chair stands and sarcopenia assessment'),
      text(locale, 'HAV／HBV 免疫血清學與完整疫苗史', 'HAV/HBV immunity serology and complete vaccine history'),
      ...missingVaccines.map(([, zh, en]) => text(locale, `${zh}疫苗狀態`, `${en} vaccine status`)),
    ],
    nextActions: [
      text(locale, '安排營養／衰弱篩檢並以乾體重設定飲食目標。', 'Arrange nutrition/frailty screening and set dietary goals using dry weight.'),
      text(locale, '查找跨院與自費疫苗紀錄後，依本地時程補齊。', 'Retrieve cross-facility and self-pay immunization records, then complete vaccines under the local schedule.'),
    ],
    guidelineReferences: [nutritionReference(locale)],
    safetyBoundary: text(
      locale,
      'Albumin 低下不是營養不良的單一診斷；蛋白質、熱量、鈉與液體目標需依腹水、腎功能、糖尿病、BMI 與進食能力個別化。',
      'Low albumin is not a standalone diagnosis of malnutrition. Protein, calorie, sodium, and fluid targets require individualization for ascites, kidney function, diabetes, BMI, and eating ability.',
    ),
  }
}

export const CIRRHOSIS_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'cirrhosis-cdss',
  diseaseCode: 'CIRRHOSIS',
  version: '0.1.0-poc',
  enabled: true,
  label: {
    zh: '肝硬化',
    en: 'Cirrhosis',
  },
  applies(profile) {
    return profile.eligibleDiseasePackIds?.includes('cirrhosis-poc') === true
  },
  build({ profile, locale }) {
    const recommendations = [
      buildStageAndReferral(profile, locale),
      buildHccSurveillance(profile, locale),
      buildPortalHypertension(profile, locale),
      buildAscitesSafety(profile, locale),
      buildEncephalopathy(profile, locale),
      buildSeverityMonitoring(profile, locale),
      buildNutritionAndPrevention(profile, locale),
    ].filter((item): item is CdssRecommendation => Boolean(item))

    const priorityOrder: Readonly<Record<CdssRecommendation['priority'], number>> = {
      high: 0,
      medium: 1,
      routine: 2,
    }
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

    const highPriorityCount = recommendations.filter(
      (item) => item.priority === 'high',
    ).length
    const needsDataCount = recommendations.filter(
      (item) => item.status === 'needs-data',
    ).length

    return {
      title: text(
        locale,
        '肝硬化個人化照護指引',
        'Personalized cirrhosis care guidance',
      ),
      summary: text(
        locale,
        `本次依診斷、失代償事件、HCC 監測、門脈高壓、用藥與安全檢驗產生 ${recommendations.length} 項提示：${highPriorityCount} 項優先處理、${needsDataCount} 項需先補資料。`,
        `${recommendations.length} prompts were generated from diagnosis, decompensation events, HCC surveillance, portal hypertension, medications, and safety laboratories: ${highPriorityCount} high priority and ${needsDataCount} requiring more data.`,
      ),
      packId: 'cirrhosis-cdss',
      packVersion: '0.1.0-poc',
      recommendations,
      notEvaluated: [
        text(
          locale,
          '即時生命徵象、出血、感染、sepsis、腹膜炎、急性意識改變、ACLF 與其他需要急性處置的狀況。',
          'Real-time vital signs, bleeding, infection, sepsis, peritonitis, acute mental-status change, ACLF, and other conditions requiring acute care.',
        ),
        text(
          locale,
          '肝硬化病因治療（HBV、HCV、酒精、MASLD、autoimmune／cholestatic／genetic disease）需用專屬路徑；本版只提醒查找病因，不自行選藥。',
          'Etiology-specific treatment for HBV, HCV, alcohol, MASLD, autoimmune/cholestatic/genetic disease requires dedicated pathways; this version only prompts etiologic review and does not select therapy.',
        ),
        text(
          locale,
          '本版不判定 Child-Pugh、正式 MELD 3.0、移植排序／例外分數、TIPS 適應症、SBP 預防性抗生素、個別藥物劑量或健保給付。',
          'This version does not determine Child-Pugh, formal MELD 3.0, transplant allocation/exception scores, TIPS candidacy, SBP antibiotic prophylaxis, individual drug doses, or insurance coverage.',
        ),
        text(
          locale,
          '本版不寫回病歷、不開立醫囑，也不自動轉介或送出檢查。',
          'This version does not write to the chart, place orders, refer automatically, or submit tests.',
        ),
      ],
      disclaimer: text(
        locale,
        'Cirrhosis CDSS POC｜依 AASLD 肝硬化門脈高壓、HCC、腹水／SBP／HRS、HE 與營養指引提供唯讀決策支援；不是診斷、醫囑或即時監測。執行前需核對完整院內病歷、症狀、理學檢查、原始報告、實際用藥與病人目標。',
        'Cirrhosis CDSS POC | Read-only decision support based on AASLD guidance for portal hypertension, HCC, ascites/SBP/HRS, HE, and nutrition. It is not a diagnosis, order, or real-time monitor. Verify the complete institutional chart, symptoms, examination, source reports, actual medication use, and patient goals before acting.',
      ),
    }
  },
}
