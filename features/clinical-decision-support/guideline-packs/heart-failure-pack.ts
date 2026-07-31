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

type HeartFailurePhenotype =
  | 'hfrEF'
  | 'hfmREF'
  | 'hfpEF'
  | 'hfimpEF'

const AHA_ACC_HF_GUIDELINE_URL = 'https://professional.heart.org/-/media/832EA0F4E73948848612F228F7FA2D35.pdf'
const ACC_HFREF_ECDP_URL = 'https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2024/03/06/19/22/2024-acc-expert-consensus-hfref'
const ACC_HFPEF_ECDP_URL = 'https://www.acc.org/latest-in-cardiology/journal-scans/2026/07/22/17/25/updated-acc-ecdp-addresses-management-of-hfpef'

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

function ahaReference(input: {
  locale: CdssLocale
  id: string
  page: number
  recommendationId: string
  locator: string
  summaryZh: string
  summaryEn: string
}): GuidelineReference {
  return {
    id: input.id,
    title: '2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure',
    publisher: 'AHA / ACC / HFSA',
    version: '2022',
    url: `${AHA_ACC_HF_GUIDELINE_URL}#page=${input.page}`,
    page: input.page,
    recommendationId: input.recommendationId,
    locator: input.locator,
    summary: text(input.locale, input.summaryZh, input.summaryEn),
  }
}

function accHfrEfReference(locale: CdssLocale): GuidelineReference {
  return {
    id: 'acc-hfref-ecdp-2024-core-gdmt',
    title: '2024 ACC Expert Consensus Decision Pathway for Treatment of HFrEF',
    publisher: 'American College of Cardiology',
    version: '2024',
    url: ACC_HFREF_ECDP_URL,
    directLink: true,
    recommendationId: 'Key points 1–3',
    locator: 'Core GDMT, rapid initiation, and referral',
    summary: text(
      locale,
      '慢性 HFrEF 的核心 GDMT 包含 ARNI、具實證的 β 阻斷劑、SGLT 抑制劑與 MRA；可行時應及早建立四大支柱，並依耐受性調整。',
      'Core chronic HFrEF GDMT includes an ARNI, an evidence-based beta-blocker, an SGLT inhibitor, and an MRA, with early establishment and tolerability-guided titration when feasible.',
    ),
  }
}

function accHfpEfReference(locale: CdssLocale): GuidelineReference {
  return {
    id: 'acc-hfpef-ecdp-2026-phenotype-management',
    title: '2026 ACC Expert Consensus Decision Pathway for Management of HFpEF',
    publisher: 'American College of Cardiology',
    version: '2026',
    url: ACC_HFPEF_ECDP_URL,
    directLink: true,
    recommendationId: 'Evaluation and management framework',
    locator: 'Accurate diagnosis, phenotype-directed therapy, and comorbidity management',
    summary: text(
      locale,
      'HFpEF 需先確認診斷並依表型處理；路徑整合 SGLT2 抑制劑、MRA、代謝治療、利尿與共病管理。',
      'HFpEF requires diagnostic confirmation and phenotype-directed care integrating SGLT2 inhibitors, MRAs, metabolic therapies, diuresis, and comorbidity management.',
    ),
  }
}

function medicationState(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): CdssMedicationClassState {
  return profile.medicationClassContexts?.[classId]?.state ?? 'not-found'
}

function isConfirmedCurrent(
  profile: CdssPatientProfile,
  classId: CdssMedicationClassId,
): boolean {
  return medicationState(profile, classId) === 'confirmed-current'
}

function needsMedicationVerification(
  state: CdssMedicationClassState,
): boolean {
  return (
    state === 'active-order-unconfirmed'
    || state === 'on-hold'
    || state === 'historical-record-current-status-unknown'
    || state === 'uncertain'
  )
}

function phenotypeFromProfile(profile: CdssPatientProfile): {
  kind?: HeartFailurePhenotype
  currentLvef?: number
  previousReducedLvef?: number
} {
  const currentLvef = numberFromFact(profile, 'LVEF')
  if (currentLvef === undefined) return {}

  const previousReducedLvef = profile.facts.LVEFTrend?.sources
    ?.slice(0, -1)
    .filter((source) => typeof source.value === 'number' && source.value <= 40)
    .map((source) => source.value as number)
    .at(-1)
  if (previousReducedLvef !== undefined && currentLvef > 40) {
    return { kind: 'hfimpEF', currentLvef, previousReducedLvef }
  }
  if (currentLvef <= 40) return { kind: 'hfrEF', currentLvef }
  if (currentLvef <= 49) return { kind: 'hfmREF', currentLvef }
  return { kind: 'hfpEF', currentLvef }
}

function phenotypeLabel(
  locale: CdssLocale,
  kind: HeartFailurePhenotype,
): string {
  const labels: Record<HeartFailurePhenotype, { zh: string; en: string }> = {
    hfrEF: { zh: 'HFrEF（LVEF ≤40%）', en: 'HFrEF (LVEF ≤40%)' },
    hfmREF: { zh: 'HFmrEF（LVEF 41–49%）', en: 'HFmrEF (LVEF 41–49%)' },
    hfpEF: { zh: 'HFpEF（LVEF ≥50%）', en: 'HFpEF (LVEF ≥50%)' },
    hfimpEF: { zh: 'HFimpEF（既往 LVEF ≤40%，目前 >40%）', en: 'HFimpEF (previous LVEF ≤40%, now >40%)' },
  }
  return text(locale, labels[kind].zh, labels[kind].en)
}

function buildPhenotype(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const phenotype = phenotypeFromProfile(profile)
  if (!phenotype.kind || phenotype.currentLvef === undefined) {
    return {
      id: 'heart-failure-phenotype',
      domain: 'diagnosis',
      priority: 'high',
      status: 'needs-data',
      overviewEvidenceFactKey: 'heartFailureDiagnosis',
      title: text(
        locale,
        '已有心衰竭診斷，但缺少可治理的 LVEF，無法選擇分型路徑',
        'Heart failure is documented, but governed LVEF is missing and phenotype-specific guidance cannot be selected',
      ),
      recommendation: text(
        locale,
        '先查找最近一次心臟超音波或其他正式 LVEF 報告；同時確認症狀、理學檢查與充盈壓證據。未取得分型前，不把 HFrEF、HFmrEF 或 HFpEF 的治療建議互相套用。',
        'Retrieve the latest echocardiogram or other formal LVEF report and confirm symptoms, examination, and evidence of elevated filling pressures. Do not interchange HFrEF, HFmrEF, and HFpEF treatment pathways before phenotype is established.',
      ),
      rationale: text(
        locale,
        '心衰竭藥物建議會隨 LVEF 分型改變；保留射出分率不能只由一個診斷碼判定。',
        'Heart-failure medication recommendations vary by LVEF phenotype, and preserved-EF heart failure cannot be established from a diagnosis code alone.',
      ),
      patientEvidence: compactEvidence([
        patientEvidence(profile, locale, 'heartFailureDiagnosis', '心衰竭診斷', 'Heart-failure diagnosis'),
        patientEvidence(profile, locale, 'BNP', 'BNP', 'BNP'),
        patientEvidence(profile, locale, 'NTproBNP', 'NT-proBNP', 'NT-proBNP'),
      ]),
      missingData: [
        text(locale, '最近一次正式 LVEF 與檢查日期', 'Latest formal LVEF and examination date'),
        text(locale, '目前症狀、NYHA 功能分級與容量狀態', 'Current symptoms, NYHA functional class, and volume status'),
      ],
      nextActions: [
        text(locale, '先找回心臟影像報告；若沒有近期檢查，由臨床人員決定是否安排心臟超音波。', 'Retrieve the cardiac imaging report first; if no recent study exists, a clinician should decide whether echocardiography is needed.'),
      ],
      guidelineReferences: [
        ahaReference({
          locale,
          id: 'aha-acc-hf-2022-lvef-classification',
          page: 21,
          recommendationId: 'Table 4',
          locator: 'Classification of HF by LVEF',
          summaryZh: 'HFrEF、HFmrEF、HFpEF 與 HFimpEF 依 LVEF 與既往軌跡分類；HFmrEF/HFpEF 還需充盈壓升高證據。',
          summaryEn: 'HFrEF, HFmrEF, HFpEF, and HFimpEF are classified by current LVEF and prior trajectory; HFmrEF/HFpEF also require evidence of increased filling pressures.',
        }),
      ],
      safetyBoundary: text(
        locale,
        '診斷碼、BNP/NT-proBNP 或單一症狀都不會被本模組自行轉成 LVEF 分型。',
        'A diagnosis code, BNP/NT-proBNP result, or isolated symptom is never converted into an LVEF phenotype by this module.',
      ),
    }
  }

  const improved = phenotype.kind === 'hfimpEF'
  return {
    id: 'heart-failure-phenotype',
    domain: 'diagnosis',
    priority: improved ? 'medium' : 'routine',
    status: improved ? 'review' : 'no-action',
    overviewEvidenceFactKey: profile.facts.LVEFTrend ? 'LVEFTrend' : 'LVEF',
    title: improved
      ? text(
          locale,
          `LVEF 由 ${phenotype.previousReducedLvef}% 改善至 ${phenotype.currentLvef}%：符合 HFimpEF 軌跡`,
          `LVEF improved from ${phenotype.previousReducedLvef}% to ${phenotype.currentLvef}%: HFimpEF trajectory`,
        )
      : text(
          locale,
          `目前 LVEF ${phenotype.currentLvef}%：進入 ${phenotypeLabel(locale, phenotype.kind)} 路徑`,
          `Current LVEF ${phenotype.currentLvef}%: ${phenotypeLabel(locale, phenotype.kind)} pathway`,
        ),
    recommendation: improved
      ? text(
          locale,
          '核對兩次影像的日期、量測方法與臨床情境；若確認為治療後 HFimpEF，不因 LVEF 改善或症狀消失就自行停用既有 HFrEF GDMT。',
          'Confirm both imaging dates, methods, and clinical contexts. If treatment-associated HFimpEF is confirmed, do not stop established HFrEF GDMT solely because LVEF or symptoms improved.',
        )
      : text(
          locale,
          '以目前 LVEF 分型選擇後續治療路徑，並和症狀、充盈壓證據、病因與共病一起判讀。',
          'Use the current LVEF phenotype to select the treatment pathway, integrated with symptoms, filling-pressure evidence, etiology, and comorbidities.',
        ),
    rationale: text(
      locale,
      improved
        ? 'HFimpEF 仍屬 stage C 心衰竭軌跡；2022 指引建議持續 GDMT 以降低復發風險。'
        : 'LVEF 分型決定哪些疾病修飾治療具有明確或較弱的建議強度。',
      improved
        ? 'HFimpEF remains on the stage C heart-failure trajectory; the 2022 guideline recommends continuing GDMT to reduce relapse risk.'
        : 'LVEF phenotype determines which disease-modifying therapies have stronger or weaker recommendations.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'heartFailureDiagnosis', '心衰竭診斷', 'Heart-failure diagnosis'),
      patientEvidence(profile, locale, 'LVEF', '目前 LVEF', 'Current LVEF'),
      patientEvidence(profile, locale, 'LVEFTrend', 'LVEF 軌跡', 'LVEF trajectory'),
    ]),
    nextActions: [
      text(locale, '將分型、症狀與實際用藥一起完成臨床核對。', 'Reconcile the phenotype with symptoms and actual medication use.'),
    ],
    guidelineReferences: [
      ahaReference({
        locale,
        id: improved
          ? 'aha-acc-hf-2022-hfimpEF'
          : 'aha-acc-hf-2022-lvef-classification',
        page: improved ? 109 : 21,
        recommendationId: improved ? 'HFimpEF Recommendation 1' : 'Table 4',
        locator: improved
          ? 'Continue GDMT after LVEF improvement'
          : 'Classification of HF by LVEF',
        summaryZh: improved
          ? '治療後 HFimpEF 應持續 GDMT，避免心衰竭與左心室功能障礙復發。'
          : '心衰竭依 LVEF 與既往軌跡分為 HFrEF、HFmrEF、HFpEF 與 HFimpEF。',
        summaryEn: improved
          ? 'Continue GDMT after treatment-associated HFimpEF to prevent relapse of heart failure and LV dysfunction.'
          : 'Heart failure is classified as HFrEF, HFmrEF, HFpEF, or HFimpEF using LVEF and prior trajectory.',
      }),
    ],
    safetyBoundary: text(
      locale,
      'LVEF 分型不等於容量狀態、NYHA 分級或病因診斷；這些仍需獨立評估。',
      'LVEF phenotype does not establish volume status, NYHA class, or etiology; each still requires separate assessment.',
    ),
  }
}

function coreMedicationEvidence(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): ClinicalEvidence[] {
  return compactEvidence([
    patientEvidence(profile, locale, 'arniTherapy', 'ARNI', 'ARNI'),
    patientEvidence(profile, locale, 'aceArbTherapy', 'ACEI／ARB', 'ACE inhibitor/ARB'),
    patientEvidence(profile, locale, 'hfEvidenceBetaBlockerTherapy', 'HFrEF 實證 β 阻斷劑', 'Evidence-based HFrEF beta-blocker'),
    patientEvidence(profile, locale, 'mraTherapy', 'MRA', 'MRA'),
    patientEvidence(profile, locale, 'sglt2Therapy', 'SGLT2 抑制劑', 'SGLT2 inhibitor'),
    patientEvidence(profile, locale, 'medicationListOverview', '現行用藥', 'Current medications'),
  ])
}

function buildHfrEfGdmt(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const arniConfirmed = isConfirmedCurrent(profile, 'arni')
  const aceArbConfirmed = isConfirmedCurrent(profile, 'ace-inhibitor-or-arb')
  const arniState = medicationState(profile, 'arni')
  const aceArbState = medicationState(profile, 'ace-inhibitor-or-arb')
  const raasState: CdssMedicationClassState = arniConfirmed || aceArbConfirmed
    ? 'confirmed-current'
    : (
        [
          'active-order-unconfirmed',
          'on-hold',
          'historical-record-current-status-unknown',
          'uncertain',
        ] as const
      ).find((state) => arniState === state || aceArbState === state)
      ?? 'not-found'
  const pillarStates = [
    {
      label: text(locale, 'ARNI（不適用時 ACEI／ARB）', 'ARNI (ACE inhibitor/ARB when ARNI is not feasible)'),
      state: raasState,
      foundAlternative: !arniConfirmed && aceArbConfirmed,
    },
    {
      label: text(locale, '具 HFrEF 實證的 β 阻斷劑', 'Evidence-based HFrEF beta-blocker'),
      state: medicationState(profile, 'hf-evidence-based-beta-blocker'),
      foundAlternative: false,
    },
    {
      label: 'MRA',
      state: medicationState(profile, 'mineralocorticoid-receptor-antagonist'),
      foundAlternative: false,
    },
    {
      label: text(locale, 'SGLT2 抑制劑', 'SGLT2 inhibitor'),
      state: medicationState(profile, 'sglt2-inhibitor'),
      foundAlternative: false,
    },
  ]
  const confirmedCount = pillarStates.filter(
    (item) => item.state === 'confirmed-current',
  ).length
  const verification = pillarStates.filter((item) => needsMedicationVerification(item.state))
  const notFound = pillarStates.filter((item) => item.state === 'not-found')
  const potassium = numberFromFact(profile, 'potassium')
  const eGfr = numberFromFact(profile, 'eGFR')
  const missingData = [
    ...(verification.length > 0 || notFound.length > 0
      ? [text(locale, '完整 medication reconciliation、實際服用方式、劑量與耐受性', 'Complete medication reconciliation, actual use, doses, and tolerability')]
      : []),
    ...(potassium === undefined
      ? [text(locale, '開始或調整 RAASi／MRA 前的近期血鉀', 'Recent potassium before starting or adjusting RAASi/MRA')]
      : []),
    ...(eGfr === undefined
      ? [text(locale, '開始或調整 RAASi／MRA／SGLT2 抑制劑前的近期 eGFR', 'Recent eGFR before starting or adjusting RAASi/MRA/SGLT2 inhibitor')]
      : []),
    text(locale, '目前血壓、心率、症狀與容量狀態', 'Current BP, heart rate, symptoms, and volume status'),
  ]

  return {
    id: 'heart-failure-hfref-gdmt',
    domain: 'medication',
    priority: confirmedCount < 4 ? 'high' : 'medium',
    status: confirmedCount < 4 || verification.length > 0 ? 'review' : 'no-action',
    overviewEvidenceFactKey: 'LVEF',
    title: text(
      locale,
      `HFrEF 四大支柱已確認 ${confirmedCount}/4 類${verification.length > 0 ? `，另 ${verification.length} 類需核對` : ''}`,
      `${confirmedCount}/4 HFrEF core pillars confirmed${verification.length > 0 ? `; ${verification.length} require verification` : ''}`,
    ),
    recommendation: text(
      locale,
      '先核對 ARNI（不適用時 ACEI／ARB）、具實證的 β 阻斷劑、MRA 與 SGLT2 抑制劑四大支柱。若病人已穩定且可耐受，依血壓、心率、腎功能、血鉀、容量狀態與偏好，及早建立低劑量四支柱並於約 3 個月內朝最大耐受劑量優化；不需等一類達標才開始下一類。',
      'Reconcile the four core pillars: ARNI (ACE inhibitor/ARB when ARNI is not feasible), an evidence-based beta-blocker, MRA, and SGLT2 inhibitor. When the patient is compensated and treatment is tolerated, use BP, heart rate, kidney function, potassium, volume status, and preferences to establish all four early and optimize toward maximally tolerated doses within about 3 months; one class need not reach target before the next is started.',
    ),
    rationale: text(
      locale,
      `${notFound.length > 0 ? `目前資料切片未見 ${notFound.map((item) => item.label).join('、')}；這是待核對的可能照護缺口，不是停用或新增醫囑。` : ''}${pillarStates.some((item) => item.foundAlternative) ? '目前辨識到 ACEI／ARB 而非 ARNI，需核對 ARNI 是否可行及既往不耐受原因。' : ''}`,
      `${notFound.length > 0 ? `The available data slice does not show ${notFound.map((item) => item.label).join(', ')}; these are possible care gaps requiring reconciliation, not stop/start orders. ` : ''}${pillarStates.some((item) => item.foundAlternative) ? 'An ACE inhibitor/ARB rather than ARNI is identified; confirm whether ARNI is feasible and whether prior intolerance exists.' : ''}`,
    ),
    patientEvidence: [
      ...coreMedicationEvidence(profile, locale),
      ...compactEvidence([
        patientEvidence(profile, locale, 'LVEF', 'LVEF', 'LVEF'),
        patientEvidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
        patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
        patientEvidence(profile, locale, 'bloodPressure', '血壓', 'Blood pressure'),
        patientEvidence(profile, locale, 'heartRate', '心率', 'Heart rate'),
      ]),
    ],
    missingData,
    nextActions: [
      text(locale, '完成實際用藥、劑量、依從性、禁忌與既往不耐受原因核對。', 'Reconcile actual use, dose, adherence, contraindications, and prior intolerance.'),
      text(locale, '由臨床人員依血流動力與安全檢驗決定起始／調整順序；未代償前延後 β 阻斷劑起始或上調。', 'A clinician should sequence initiation/titration using hemodynamics and safety laboratories; defer beta-blocker initiation or uptitration until HF is compensated.'),
    ],
    guidelineReferences: [
      accHfrEfReference(locale),
      ahaReference({
        locale,
        id: 'aha-acc-hf-2022-hfref-four-pillars',
        page: 70,
        recommendationId: 'Stage C HFrEF recommendations, pp. 70–75',
        locator: 'ARNI/ACEI/ARB, evidence-based beta-blockers, MRA, and SGLT2 inhibitors',
        summaryZh: 'HFrEF 的疾病修飾治療包含 RAAS 抑制、具實證 β 阻斷劑、MRA 與 SGLT2 抑制劑；MRA 需同時考量 eGFR 與血鉀。',
        summaryEn: 'Disease-modifying HFrEF therapy includes RAAS inhibition, an evidence-based beta-blocker, MRA, and SGLT2 inhibitor; MRA use also depends on eGFR and potassium.',
      }),
    ],
    safetyBoundary: text(
      locale,
      '本模組只核對藥物類別是否出現在受治理資料；不判定實際服藥、目標劑量、血流動力穩定、禁忌或給付，也不自動開藥、換藥或停藥。',
      'This module only checks whether medication classes appear in governed data. It does not establish actual use, target dose, hemodynamic stability, contraindications, or coverage, and it never starts, switches, or stops treatment.',
    ),
  }
}

function buildNonReducedEfTherapy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  kind: 'hfmREF' | 'hfpEF',
): CdssRecommendation {
  const sglt2State = medicationState(profile, 'sglt2-inhibitor')
  const confirmed = sglt2State === 'confirmed-current'
  const hfpEf = kind === 'hfpEF'

  return {
    id: hfpEf
      ? 'heart-failure-hfpef-treatment'
      : 'heart-failure-hfmref-treatment',
    domain: 'medication',
    priority: confirmed ? 'routine' : 'medium',
    status: confirmed ? 'no-action' : 'review',
    overviewEvidenceFactKey: 'LVEF',
    title: confirmed
      ? text(
          locale,
          `${phenotypeLabel(locale, kind)}：已確認 SGLT2 抑制劑`,
          `${phenotypeLabel(locale, kind)}: SGLT2 inhibitor confirmed`,
        )
      : text(
          locale,
          `${phenotypeLabel(locale, kind)}：核對 SGLT2 抑制劑與表型導向治療`,
          `${phenotypeLabel(locale, kind)}: reconcile SGLT2 inhibitor and phenotype-directed therapy`,
        ),
    recommendation: text(
      locale,
      hfpEf
        ? '先確認 HFpEF 診斷、症狀與充盈壓證據，再核對 SGLT2 抑制劑；依鬱血、血壓、心房顫動、冠心病、腎臟病、糖尿病、肥胖與其他表型共同決策。MRA／ARNI／ARB 或代謝治療不能只依一筆 LVEF 自動建議。'
        : '核對 SGLT2 抑制劑；對目前或既往有症狀的 HFmrEF，可依 LVEF 接近 40% 的程度、血壓、腎功能、血鉀與耐受性，個別評估 HFrEF 實證 β 阻斷劑、ARNI／ACEI／ARB 與 MRA。',
      hfpEf
        ? 'First confirm HFpEF diagnosis, symptoms, and evidence of increased filling pressures, then reconcile SGLT2-inhibitor use. Use congestion, BP, atrial fibrillation, coronary disease, kidney disease, diabetes, obesity, and other phenotypes for shared decisions. MRA/ARNI/ARB or metabolic treatment is never suggested automatically from one LVEF value.'
        : 'Reconcile SGLT2-inhibitor use. For current or previously symptomatic HFmrEF, individualize consideration of an evidence-based HFrEF beta-blocker, ARNI/ACE inhibitor/ARB, and MRA using proximity of LVEF to 40%, BP, kidney function, potassium, and tolerability.',
    ),
    rationale: text(
      locale,
      hfpEf
        ? 'HFpEF 是異質性的多系統症候群；準確診斷與表型／共病管理先於藥物清單勾選。'
        : 'HFmrEF 的 SGLT2 抑制劑建議較強；其他 HFrEF 藥物為較弱、且在 LVEF 較低端可能獲益較大的個別化建議。',
      hfpEf
        ? 'HFpEF is a heterogeneous multisystem syndrome; accurate diagnosis and phenotype/comorbidity management come before medication checklist completion.'
        : 'The SGLT2-inhibitor recommendation is stronger in HFmrEF; other HFrEF therapies have weaker, individualized recommendations with potentially greater benefit near the lower end of the LVEF range.',
    ),
    patientEvidence: [
      ...compactEvidence([
        patientEvidence(profile, locale, 'LVEF', 'LVEF', 'LVEF'),
        patientEvidence(profile, locale, 'BNP', 'BNP', 'BNP'),
        patientEvidence(profile, locale, 'NTproBNP', 'NT-proBNP', 'NT-proBNP'),
        patientEvidence(profile, locale, 'sglt2Therapy', 'SGLT2 抑制劑', 'SGLT2 inhibitor'),
        patientEvidence(profile, locale, 'bloodPressure', '血壓', 'Blood pressure'),
        patientEvidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
        patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      ]),
    ],
    missingData: [
      ...(needsMedicationVerification(sglt2State) || sglt2State === 'not-found'
        ? [text(locale, '完整 medication reconciliation 與 SGLT2 抑制劑禁忌／不耐受史', 'Complete medication reconciliation and SGLT2-inhibitor contraindication/intolerance history')]
        : []),
      text(locale, '目前症狀、NYHA 功能分級與容量狀態', 'Current symptoms, NYHA functional class, and volume status'),
      ...(hfpEf
        ? [text(locale, 'HFpEF 的充盈壓證據、替代診斷與主要表型', 'HFpEF filling-pressure evidence, alternative diagnoses, and dominant phenotype')]
        : []),
    ],
    nextActions: [
      text(locale, '由臨床人員確認分型與適應症後，再依完整病歷共同決策。', 'After a clinician confirms phenotype and indication, use the complete chart for shared decision-making.'),
    ],
    guidelineReferences: [
      ahaReference({
        locale,
        id: hfpEf
          ? 'aha-acc-hf-2022-hfpef-treatment'
          : 'aha-acc-hf-2022-hfmref-treatment',
        page: hfpEf ? 110 : 107,
        recommendationId: hfpEf
          ? 'HFpEF Recommendations 1–7'
          : 'HFmrEF Recommendations 1–2',
        locator: hfpEf
          ? 'HF with preserved ejection fraction'
          : 'HF with mildly reduced ejection fraction',
        summaryZh: hfpEf
          ? 'HFpEF 應控制血壓、處理 AF，並考量 SGLT2 抑制劑；其他藥物需選擇個案。'
          : 'HFmrEF 可使用 SGLT2 抑制劑；其他 HFrEF 藥物可在選擇個案中考量。',
        summaryEn: hfpEf
          ? 'HFpEF care includes BP control, AF management, and consideration of SGLT2 inhibitors; other therapies require patient selection.'
          : 'SGLT2 inhibitors can be used in HFmrEF; selected patients may be considered for other HFrEF therapies.',
      }),
      ...(hfpEf ? [accHfpEfReference(locale)] : []),
    ],
    safetyBoundary: text(
      locale,
      '本模組不把 LVEF ≥50% 單獨當成 HFpEF 確診，也不把未出現在資料切片的藥物當成確定未使用。',
      'This module does not diagnose HFpEF from LVEF ≥50% alone and does not treat a medication absent from the data slice as definitely not used.',
    ),
  }
}

function buildImprovedEfTherapy(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  return {
    id: 'heart-failure-hfimpEF-therapy',
    domain: 'medication',
    priority: 'high',
    status: 'review',
    overviewEvidenceFactKey: 'LVEFTrend',
    title: text(
      locale,
      'HFimpEF：核對並持續既有 HFrEF GDMT',
      'HFimpEF: reconcile and continue established HFrEF GDMT',
    ),
    recommendation: text(
      locale,
      '確認 LVEF 改善是在 HFrEF 治療後發生，並核對目前實際服用與耐受的 GDMT；不要只因目前 LVEF >40% 或症狀改善就自行降階或停藥。',
      'Confirm that LVEF improvement followed HFrEF treatment and reconcile the GDMT actually taken and tolerated. Do not de-escalate or stop therapy solely because current LVEF is above 40% or symptoms improved.',
    ),
    rationale: text(
      locale,
      'HFimpEF 仍有心衰竭與左心室功能障礙復發風險。',
      'HFimpEF remains at risk for relapse of heart failure and LV dysfunction.',
    ),
    patientEvidence: [
      ...compactEvidence([
        patientEvidence(profile, locale, 'LVEFTrend', 'LVEF 軌跡', 'LVEF trajectory'),
      ]),
      ...coreMedicationEvidence(profile, locale),
    ],
    missingData: [
      text(locale, '完整 medication reconciliation、停藥／不耐受原因與心衰竭症狀', 'Complete medication reconciliation, reasons for discontinuation/intolerance, and HF symptoms'),
    ],
    nextActions: [
      text(locale, '由臨床人員核對既有 GDMT 與追蹤計畫；任何變更都需使用完整病歷。', 'A clinician should reconcile established GDMT and follow-up; any change requires the complete chart.'),
    ],
    guidelineReferences: [
      ahaReference({
        locale,
        id: 'aha-acc-hf-2022-hfimpEF-continue-gdmt',
        page: 109,
        recommendationId: 'HFimpEF Recommendation 1',
        locator: 'Continue GDMT after LVEF improvement',
        summaryZh: '治療後 HFimpEF 應持續 GDMT，以避免心衰竭與左心室功能障礙復發。',
        summaryEn: 'Continue GDMT after treatment-associated HFimpEF to prevent relapse of HF and LV dysfunction.',
      }),
    ],
    safetyBoundary: text(
      locale,
      '本模組不會因 EF 改善自動停藥，也不會推定改善一定由治療造成。',
      'The module never stops medication because EF improved and does not assume treatment caused the improvement.',
    ),
  }
}

function buildMraSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const mraState = medicationState(profile, 'mineralocorticoid-receptor-antagonist')
  if (mraState === 'not-found') return undefined

  const potassium = numberFromFact(profile, 'potassium')
  const eGfr = numberFromFact(profile, 'eGFR')
  const severePotassium = potassium !== undefined && potassium >= 5.5
  const elevatedPotassium = potassium !== undefined && potassium >= 5
  const lowEgfr = eGfr !== undefined && eGfr <= 30
  const missing = [
    ...(potassium === undefined ? [text(locale, '近期血鉀', 'Recent potassium')] : []),
    ...(eGfr === undefined ? [text(locale, '近期 eGFR', 'Recent eGFR')] : []),
  ]
  if (!severePotassium && !elevatedPotassium && !lowEgfr && missing.length === 0) {
    return undefined
  }

  return {
    id: 'heart-failure-mra-safety',
    domain: 'safety',
    priority: severePotassium || lowEgfr ? 'high' : 'medium',
    status: missing.length > 0 ? 'needs-data' : 'review',
    overviewEvidenceFactKey: severePotassium || elevatedPotassium ? 'potassium' : 'eGFR',
    title: severePotassium
      ? text(
          locale,
          `MRA 紀錄合併血鉀 ${potassium} mmol/L：立即完成臨床與藥物安全核對`,
          `MRA record with potassium ${potassium} mmol/L: complete urgent clinical and medication-safety review`,
        )
      : lowEgfr
        ? text(
            locale,
            `MRA 紀錄合併 eGFR ${eGfr}：需優先核對安全性`,
            `MRA record with eGFR ${eGfr}: prioritize safety review`,
          )
        : elevatedPotassium
          ? text(
              locale,
              `MRA 紀錄合併血鉀 ${potassium} mmol/L：開始／續用條件需重新評估`,
              `MRA record with potassium ${potassium} mmol/L: reassess initiation/continuation conditions`,
            )
          : text(
              locale,
              'MRA 紀錄缺少近期血鉀或 eGFR',
              'Recent potassium or eGFR is missing for the MRA record',
            ),
    recommendation: text(
      locale,
      '立即核對檢驗日期、溶血、腎功能趨勢、實際用藥與劑量、鉀補充品、其他 RAASi、脫水／急性病況及心律；由臨床人員依重測與完整情境決定處置，不依單筆健康存摺結果自動停藥。',
      'Immediately verify laboratory date, hemolysis, kidney-function trend, actual medication and dose, potassium supplements, other RAAS inhibitors, dehydration/acute illness, and rhythm. A clinician should act on repeat testing and the complete context; do not stop treatment automatically from one My Health Bank result.',
    ),
    rationale: text(
      locale,
      'HFrEF 使用 MRA 的指引條件包括 eGFR >30 且血鉀 <5.0 mmol/L，開始後需密切監測；若血鉀無法維持 <5.5 mmol/L，需避免致命性高血鉀風險。',
      'Guideline criteria for MRA use in HFrEF include eGFR >30 and potassium <5.0 mmol/L with close monitoring after initiation; inability to maintain potassium below 5.5 mmol/L raises life-threatening hyperkalemia risk.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'mraTherapy', 'MRA', 'MRA'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      patientEvidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      patientEvidence(profile, locale, 'serumCreatinineTrend', 'Creatinine 趨勢', 'Creatinine trend'),
    ]),
    missingData: missing,
    nextActions: [
      text(locale, '核對院內即時檢驗與實際用藥；高血鉀或症狀性病人依院內緊急流程處理。', 'Verify real-time institutional laboratories and actual medication use; manage hyperkalemia or symptomatic patients through the institutional urgent pathway.'),
    ],
    guidelineReferences: [
      ahaReference({
        locale,
        id: 'aha-acc-hf-2022-mra-safety',
        page: 74,
        recommendationId: 'MRA Recommendations 1 and 3',
        locator: 'MRA kidney-function and potassium thresholds',
        summaryZh: 'HFrEF 使用 MRA 需符合腎功能與血鉀條件並密切監測；持續高血鉀需避免嚴重傷害。',
        summaryEn: 'MRA use in HFrEF requires kidney-function and potassium criteria with close monitoring; persistent hyperkalemia requires action to avoid serious harm.',
      }),
    ],
    safetyBoundary: text(
      locale,
      '單筆血鉀或 eGFR 不會觸發自動停藥；急迫性仍取決於重測、症狀、心電圖、趨勢與完整病歷。',
      'One potassium or eGFR value never triggers automatic discontinuation; urgency still depends on repeat testing, symptoms, ECG, trajectory, and the complete chart.',
    ),
  }
}

function buildMedicationSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation | undefined {
  const hasNsaid = Boolean(profile.facts.currentNsaid)
  const hasOther = Boolean(profile.facts.currentPotentialHfWorseningMedication)
  if (!hasNsaid && !hasOther) return undefined

  return {
    id: 'heart-failure-medication-safety',
    domain: 'safety',
    priority: 'high',
    status: 'review',
    overviewEvidenceFactKey: hasNsaid
      ? 'currentNsaid'
      : 'currentPotentialHfWorseningMedication',
    title: text(
      locale,
      '辨識到可能使心衰竭惡化或需依分型核對的藥物',
      'Medication(s) that may worsen HF or require phenotype-specific review were identified',
    ),
    recommendation: text(
      locale,
      '核對適應症、實際使用、處方者、開始時間與症狀／體重／腎功能變化。HFrEF 應避免或儘可能撤除 NSAID；diltiazem／verapamil、thiazolidinedione、部分 DPP-4 抑制劑與抗心律不整藥需依心衰竭分型及適應症個別判斷。',
      'Reconcile indication, actual use, prescriber, start date, and changes in symptoms, weight, and kidney function. NSAIDs should be avoided or withdrawn whenever possible in HFrEF; diltiazem/verapamil, thiazolidinediones, selected DPP-4 inhibitors, and antiarrhythmics require phenotype- and indication-specific review.',
    ),
    rationale: text(
      locale,
      '這些藥物可能造成鈉水滯留、負性肌力、心律風險或增加心衰竭住院；但病人可能有其他重要適應症。',
      'These medications may promote sodium/fluid retention, negative inotropy, arrhythmic risk, or HF hospitalization, but the patient may have another important indication.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'currentNsaid', 'NSAID', 'NSAID'),
      patientEvidence(profile, locale, 'currentPotentialHfWorseningMedication', '其他需核對藥物', 'Other medications requiring review'),
      patientEvidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      patientEvidence(profile, locale, 'bodyWeight', '體重', 'Body weight'),
    ]),
    missingData: [
      text(locale, '實際用藥、適應症、開始時間與處方者', 'Actual use, indication, start date, and prescriber'),
      text(locale, '近期症狀、體重、容量狀態與腎功能趨勢', 'Recent symptoms, weight, volume status, and kidney-function trend'),
    ],
    nextActions: [
      text(locale, '完成跨處方來源 medication reconciliation，再由臨床人員決定替代、調整或續用。', 'Complete medication reconciliation across prescribers before a clinician decides whether to substitute, adjust, or continue.'),
    ],
    guidelineReferences: [
      ahaReference({
        locale,
        id: 'aha-acc-hf-2022-drugs-that-worsen-hf',
        page: 81,
        recommendationId: 'Drugs of Unproven Value or That May Worsen HF, Recommendations 1–7',
        locator: 'Medications that may worsen heart failure',
        summaryZh: 'HFrEF 應避免無效或可能造成傷害的特定藥物，包括 NSAID 與若干負性肌力／代謝藥物。',
        summaryEn: 'Specific ineffective or potentially harmful medications, including NSAIDs and selected negative-inotropic or metabolic drugs, should be avoided in HFrEF.',
      }),
    ],
    safetyBoundary: text(
      locale,
      '文字或藥碼比對只會產生「需核對」提示；本模組不會自行判定因果或自動停藥。',
      'Text/code matching only creates a review prompt; the module does not establish causality or stop medication.',
    ),
  }
}

function buildMonitoring(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const missing = [
    text(locale, '呼吸困難、端坐呼吸、水腫、疲倦、胸痛、暈厥與 NYHA 功能分級', 'Dyspnea, orthopnea, edema, fatigue, chest pain, syncope, and NYHA functional class'),
    text(locale, '乾重、近期體重趨勢、容量狀態與利尿反應', 'Dry weight, recent weight trend, volume status, and diuretic response'),
    ...(!profile.facts.bloodPressure
      ? [text(locale, '近期血壓', 'Recent blood pressure')]
      : []),
    ...(!profile.facts.heartRate
      ? [text(locale, '近期心率與心律', 'Recent heart rate and rhythm')]
      : [text(locale, '目前心律', 'Current rhythm')]),
    ...(!profile.facts.eGFR
      ? [text(locale, '近期 eGFR', 'Recent eGFR')]
      : []),
    ...(!profile.facts.potassium
      ? [text(locale, '近期血鉀', 'Recent potassium')]
      : []),
    ...(!profile.facts.sodium
      ? [text(locale, '近期血鈉', 'Recent sodium')]
      : []),
  ]

  return {
    id: 'heart-failure-monitoring',
    domain: 'monitoring',
    priority: 'medium',
    status: 'needs-data',
    overviewEvidenceFactKey: profile.facts.bodyWeight
      ? 'bodyWeight'
      : profile.facts.bloodPressure
        ? 'bloodPressure'
        : 'heartFailureDiagnosis',
    title: text(
      locale,
      '完成症狀、容量狀態、生命徵象與治療安全監測',
      'Complete symptom, volume-status, vital-sign, and treatment-safety monitoring',
    ),
    recommendation: text(
      locale,
      '建立症狀、NYHA、每日體重／乾重、血壓、心率／心律、容量狀態、腎功能與電解質的可追蹤基準；依近期住院、鬱血、藥物調整與病情決定追蹤時點。急性呼吸困難、胸痛、暈厥、意識改變、休息時低血氧或快速水腫／體重增加需即時臨床評估。',
      'Establish a trackable baseline for symptoms, NYHA class, daily/dry weight, BP, heart rate/rhythm, volume status, kidney function, and electrolytes. Set follow-up timing from recent hospitalization, congestion, medication changes, and clinical course. Acute dyspnea, chest pain, syncope, altered mental status, resting hypoxemia, or rapidly increasing edema/weight requires immediate clinical assessment.',
    ),
    rationale: text(
      locale,
      '健康存摺的零散檢驗與處方無法判定目前是否代償、鬱血或需要急性處置。',
      'Fragmented My Health Bank laboratory and prescription data cannot establish current compensation, congestion, or need for acute treatment.',
    ),
    patientEvidence: compactEvidence([
      patientEvidence(profile, locale, 'bodyWeight', '最近體重', 'Latest body weight'),
      patientEvidence(profile, locale, 'bloodPressure', '最近血壓', 'Latest blood pressure'),
      patientEvidence(profile, locale, 'heartRate', '最近心率', 'Latest heart rate'),
      patientEvidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      patientEvidence(profile, locale, 'potassium', '血鉀', 'Potassium'),
      patientEvidence(profile, locale, 'sodium', '血鈉', 'Sodium'),
      patientEvidence(profile, locale, 'loopDiureticTherapy', 'Loop 利尿劑', 'Loop diuretic'),
    ]),
    missingData: missing,
    nextActions: [
      text(locale, '先查找院內近期病歷與出院計畫，再補齊病人自述與量測資料。', 'Retrieve recent institutional notes and the discharge plan first, then complete patient-reported and measured data.'),
      text(locale, '若目前有警訊症狀，不等待例行門診或本模組補資料。', 'If warning symptoms are present now, do not wait for routine follow-up or module data completion.'),
    ],
    guidelineReferences: [
      ahaReference({
        locale,
        id: 'aha-acc-hf-2022-self-care-and-decongestion',
        page: 65,
        recommendationId: 'Stage C nonpharmacologic and decongestion recommendations',
        locator: 'Symptoms, activity, sodium, and diuretic/decongestion strategy',
        summaryZh: 'Stage C 心衰竭需整合自我照護、活動與鬱血處理；有液體滯留時使用利尿劑改善症狀。',
        summaryEn: 'Stage C HF care integrates self-care, activity, and congestion management; diuretics relieve symptoms when fluid retention is present.',
      }),
    ],
    safetyBoundary: text(
      locale,
      '本模組沒有即時症狀、氧合、理學檢查、輸入輸出或影像，不能排除急性失代償。',
      'The module lacks real-time symptoms, oxygenation, examination, intake/output, and imaging and therefore cannot exclude acute decompensation.',
    ),
  }
}

export const HEART_FAILURE_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'heart-failure-cdss',
  diseaseCode: 'HF',
  version: '0.1.0-poc',
  enabled: true,
  label: {
    zh: '心衰竭',
    en: 'Heart failure',
  },
  applies(profile) {
    return profile.eligibleDiseasePackIds?.includes('heart-failure-poc') === true
  },
  build({ profile, locale }) {
    const phenotype = phenotypeFromProfile(profile)
    const recommendations = [
      buildPhenotype(profile, locale),
      ...(phenotype.kind === 'hfrEF'
        ? [buildHfrEfGdmt(profile, locale)]
        : phenotype.kind === 'hfmREF' || phenotype.kind === 'hfpEF'
          ? [buildNonReducedEfTherapy(profile, locale, phenotype.kind)]
          : phenotype.kind === 'hfimpEF'
            ? [buildImprovedEfTherapy(profile, locale)]
            : []),
      buildMraSafety(profile, locale),
      buildMedicationSafety(profile, locale),
      buildMonitoring(profile, locale),
    ].filter((item): item is CdssRecommendation => Boolean(item))
    const highPriorityCount = recommendations.filter(
      (item) => item.priority === 'high',
    ).length
    const needsDataCount = recommendations.filter(
      (item) => item.status === 'needs-data',
    ).length

    return {
      title: text(
        locale,
        '心衰竭個人化照護指引',
        'Personalized heart-failure care guidance',
      ),
      summary: text(
        locale,
        `本次依診斷、LVEF、藥物與安全檢驗產生 ${recommendations.length} 項提示：${highPriorityCount} 項優先處理、${needsDataCount} 項需先補資料。`,
        `${recommendations.length} prompts were generated from diagnosis, LVEF, medication, and safety laboratory data: ${highPriorityCount} high priority and ${needsDataCount} requiring more data.`,
      ),
      packId: 'heart-failure-cdss',
      packVersion: '0.1.0-poc',
      recommendations,
      notEvaluated: [
        text(
          locale,
          '即時失代償、休克、低血氧、急性冠心症、肺栓塞、嚴重瓣膜病、心肌炎與其他急症。',
          'Real-time decompensation, shock, hypoxemia, acute coronary syndrome, pulmonary embolism, severe valve disease, myocarditis, and other emergencies.',
        ),
        text(
          locale,
          'NYHA、心律與 ECG/QRS、鬱血理學檢查、利尿反應、心衰竭病因、鐵缺乏，以及 ICD／CRT／進階心衰竭治療適應症。',
          'NYHA class, rhythm and ECG/QRS, examination for congestion, diuretic response, HF etiology, iron deficiency, and candidacy for ICD/CRT or advanced HF therapies.',
        ),
        text(
          locale,
          '2026 HFpEF 路徑中的非類固醇 MRA、incretin 與其他表型治療需完整診斷、適應症及禁忌資料，本版不自動提出個別處方。',
          'Nonsteroidal MRA, incretin, and other phenotype therapies in the 2026 HFpEF pathway require complete diagnostic, indication, and contraindication data; this version does not generate individual prescriptions.',
        ),
        text(
          locale,
          '本版不寫回病歷、不開立醫囑、不計算個別劑量，也不判定健保給付。',
          'This version does not write to the chart, place orders, calculate individual doses, or determine National Health Insurance coverage.',
        ),
      ],
      disclaimer: text(
        locale,
        'Heart Failure CDSS POC｜依 2022 AHA/ACC/HFSA 心衰竭指引、2024 ACC HFrEF ECDP 與 2026 ACC HFpEF ECDP 提供唯讀決策支援；不是診斷、醫囑或即時監測。執行前需核對完整院內病歷、血流動力、實際用藥與病人目標。',
        'Heart Failure CDSS POC | Read-only decision support based on the 2022 AHA/ACC/HFSA HF guideline, 2024 ACC HFrEF ECDP, and 2026 ACC HFpEF ECDP. It is not a diagnosis, order, or real-time monitor. Verify the complete institutional chart, hemodynamics, actual medication use, and patient goals before acting.',
      ),
    }
  },
}
