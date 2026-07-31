import type {
  CdssDcsiDomainContext,
  CdssLocale,
  CdssPatientProfile,
  ClinicalEvidence,
  DcsiDomainAssessment,
  DcsiDomainId,
  DcsiSummary,
  GuidelineReference,
} from '../types'
import { DCSI_GLASHEEN_2017_SUPPLEMENT_URL } from './dcsi-codebook'

const DCSI_ORIGINAL_STUDY_URL = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3810070/'
const DCSI_TAIWAN_VALIDATION_URL = 'https://www.sciencedirect.com/science/article/pii/S1056872714001500'

const DOMAIN_ORDER: readonly DcsiDomainId[] = [
  'ophthalmic',
  'nephropathy',
  'neuropathy',
  'cerebrovascular',
  'cardiovascular',
  'peripheral-vascular',
  'metabolic',
]

const DOMAIN_LABELS: Record<DcsiDomainId, { zh: string; en: string }> = {
  ophthalmic: { zh: '眼部病變', en: 'Ophthalmic' },
  nephropathy: { zh: '腎病變', en: 'Nephropathy' },
  neuropathy: { zh: '神經病變', en: 'Neuropathy' },
  cerebrovascular: { zh: '腦血管病變', en: 'Cerebrovascular' },
  cardiovascular: { zh: '心血管病變', en: 'Cardiovascular' },
  'peripheral-vascular': { zh: '周邊血管病變', en: 'Peripheral vascular' },
  metabolic: { zh: '急性代謝併發症', en: 'Acute metabolic' },
}

const DOMAIN_SCORE_CRITERIA: Record<DcsiDomainId, {
  maxScore: 1 | 2
  criteria: readonly {
    score: 1 | 2
    zh: string
    en: string
  }[]
}> = {
  ophthalmic: {
    maxScore: 2,
    criteria: [
      {
        score: 1,
        zh: '糖尿病眼病、背景／非增殖性視網膜病變或黃斑／視網膜水腫',
        en: 'Diabetic eye disease, background/nonproliferative retinopathy, or macular/retinal edema',
      },
      {
        score: 2,
        zh: '增殖性視網膜病變、視網膜剝離、玻璃體出血或失明',
        en: 'Proliferative retinopathy, retinal detachment, vitreous hemorrhage, or blindness',
      },
    ],
  },
  nephropathy: {
    maxScore: 2,
    criteria: [
      {
        score: 1,
        zh: '糖尿病腎病／白蛋白尿，或 CKD 第 1–3 期',
        en: 'Diabetic nephropathy/albuminuria or CKD stages 1–3',
      },
      {
        score: 2,
        zh: 'CKD 第 4–5 期、腎衰竭、透析或腎臟移植',
        en: 'CKD stages 4–5, kidney failure, dialysis, or kidney transplant',
      },
    ],
  },
  neuropathy: {
    maxScore: 1,
    criteria: [{
      score: 1,
      zh: '糖尿病周邊、自主神經或其他神經病變；本構面最高 1 分',
      en: 'Diabetic peripheral, autonomic, or other neuropathy; this domain has a maximum of 1 point',
    }],
  },
  cerebrovascular: {
    maxScore: 2,
    criteria: [
      {
        score: 1,
        zh: '暫時性腦缺血發作（TIA）',
        en: 'Transient ischemic attack (TIA)',
      },
      {
        score: 2,
        zh: '腦中風',
        en: 'Stroke',
      },
    ],
  },
  cardiovascular: {
    maxScore: 2,
    criteria: [
      {
        score: 1,
        zh: '動脈粥樣硬化、缺血性心臟病或心絞痛',
        en: 'Atherosclerosis, ischemic heart disease, or angina',
      },
      {
        score: 2,
        zh: '心肌梗塞、心衰竭、嚴重心律不整／心跳停止或主動脈瘤／剝離',
        en: 'Myocardial infarction, heart failure, serious arrhythmia/cardiac arrest, or aortic aneurysm/dissection',
      },
    ],
  },
  'peripheral-vascular': {
    maxScore: 2,
    criteria: [
      {
        score: 1,
        zh: '糖尿病周邊血管病、間歇性跛行或足部傷口',
        en: 'Diabetic peripheral vascular disease, intermittent claudication, or a foot wound',
      },
      {
        score: 2,
        zh: '下肢動脈栓塞／血栓、下肢潰瘍或壞疽',
        en: 'Lower-extremity arterial embolism/thrombosis, lower-limb ulcer, or gangrene',
      },
    ],
  },
  metabolic: {
    maxScore: 2,
    criteria: [
      {
        score: 1,
        zh: '酮酸中毒、高滲透壓狀態或低血糖，未合併昏迷',
        en: 'Ketoacidosis, hyperosmolarity, or hypoglycemia without coma',
      },
      {
        score: 2,
        zh: '上述急性代謝事件合併昏迷',
        en: 'An acute metabolic event above with coma',
      },
    ],
  },
}

function text(locale: CdssLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh
}

function eGfrFromFact(profile: CdssPatientProfile): number | undefined {
  const fact = profile.facts.eGFR
  if (!fact || fact.unit !== 'mL/min/1.73m²') return undefined
  return typeof fact.numericValue === 'number' && Number.isFinite(fact.numericValue)
    ? fact.numericValue
    : undefined
}

function evidenceFromFacts(
  profile: CdssPatientProfile,
  locale: CdssLocale,
  factKeys: readonly string[],
): ClinicalEvidence[] {
  return factKeys.flatMap((factKey) => {
    const localized = profile.facts[factKey]
    if (!localized) return []

    const labelByKey: Record<string, { zh: string; en: string }> = {
      kidneyDiagnosis: { zh: '糖尿病腎臟診斷', en: 'Diabetes kidney diagnosis' },
      eGFR: { zh: '最新腎絲球過濾率', en: 'Latest eGFR' },
      dcsiOphthalmicEvidence: { zh: '眼部病變依據', en: 'Ophthalmic evidence' },
      dcsiNephropathyEvidence: { zh: '腎病變依據', en: 'Nephropathy evidence' },
      dcsiNeuropathyEvidence: { zh: '神經病變依據', en: 'Neuropathy evidence' },
      dcsiCerebrovascularEvidence: { zh: '腦血管病變依據', en: 'Cerebrovascular evidence' },
      dcsiCardiovascularEvidence: { zh: '心血管病變依據', en: 'Cardiovascular evidence' },
      dcsiPeripheralVascularEvidence: { zh: '周邊血管病變依據', en: 'Peripheral vascular evidence' },
      dcsiMetabolicEvidence: { zh: '急性代謝併發症依據', en: 'Acute metabolic evidence' },
    }
    const label = labelByKey[factKey] ?? { zh: factKey, en: factKey }

    return [{
      label: label[locale === 'en' ? 'en' : 'zh'],
      value: localized[locale === 'en' ? 'en' : 'zh'],
      factKeys: [factKey],
      sources: localized.sources,
    }]
  })
}

function validatedContext(
  id: DcsiDomainId,
  context: CdssDcsiDomainContext | undefined,
): CdssDcsiDomainContext | undefined {
  if (!context) return undefined
  if (id === 'neuropathy' && context.score > 1) return undefined
  return context
}

function inferredNephropathyContext(
  profile: CdssPatientProfile,
): CdssDcsiDomainContext | undefined {
  const eligibilityCode = profile.diseasePackEligibility?.['dm-poc']?.code.toUpperCase()
  const hasDiabeticKidneyCode = eligibilityCode === 'E11.21'
    || eligibilityCode === 'E11.22'
    || Boolean(profile.facts.kidneyDiagnosis)
  if (!hasDiabeticKidneyCode) return undefined

  const eGfr = eGfrFromFact(profile)
  const score: 1 | 2 = eGfr !== undefined && eGfr < 30 ? 2 : 1
  const factKeys = [
    ...(profile.facts.kidneyDiagnosis ? ['kidneyDiagnosis'] : []),
    ...(profile.facts.eGFR ? ['eGFR'] : []),
  ]

  return {
    score,
    factKeys,
    basis: eGfr === undefined ? 'governed-code' : 'governed-code-and-lab',
    diabetesAttribution: 'explicit',
  }
}

function evidenceReferences(locale: CdssLocale): GuidelineReference[] {
  return [
    {
      id: 'DCSI-Young-2008',
      title: 'Diabetes Complications Severity Index and Risk of Mortality, Hospitalization, and Healthcare Utilization',
      publisher: 'American Journal of Managed Care',
      version: '2008',
      url: DCSI_ORIGINAL_STUDY_URL,
      locator: text(locale, '原始 DCSI 建立與驗證研究', 'Original DCSI development and validation'),
      summary: text(
        locale,
        'DCSI 以七類糖尿病併發症的存在與嚴重度形成 0–13 分指標；較高分數與住院及死亡風險增加相關。',
        'DCSI combines the presence and severity of seven diabetes complication domains into a 0–13 score; higher scores were associated with hospitalization and mortality.',
      ),
    },
    {
      id: 'DCSI-Glasheen-2017',
      title: 'Diabetes Complications Severity Index (DCSI)—Update and ICD-10 translation',
      publisher: 'Journal of Diabetes and Its Complications',
      version: '2017',
      url: DCSI_GLASHEEN_2017_SUPPLEMENT_URL,
      locator: text(
        locale,
        'Supplementary Appendix A-1～A-7：七類 ICD-10 計分表',
        'Supplementary Appendix A-1–A-7: seven ICD-10 scoring tables',
      ),
      summary: text(
        locale,
        '更新版附錄提供七類 ICD-10 計分表並納入 eGFR；腎臟病第 1–3 期計 1 分，第 4–5 期計 2 分。',
        'The update supplies seven ICD-10 scoring tables and adds eGFR; CKD stages 1–3 receive 1 point and stages 4–5 receive 2 points.',
      ),
    },
    {
      id: 'aDCSI-Taiwan-2014',
      title: 'Risk of Hospitalization and Healthcare Cost Associated With Diabetes Complication Severity Index in Taiwan',
      publisher: 'Journal of Diabetes and Its Complications',
      version: '2014',
      url: DCSI_TAIWAN_VALIDATION_URL,
      locator: text(locale, '台灣健保資料驗證', 'Taiwan National Health Insurance validation'),
      summary: text(
        locale,
        '台灣健保資料研究顯示 aDCSI 與住院及醫療成本增加相關，支持它用於群體分層；仍不能把分數當成個人治療規則。',
        'A Taiwan National Health Insurance study associated aDCSI with hospitalization and healthcare costs, supporting population stratification rather than individual treatment rules.',
      ),
    },
  ]
}

export function buildDcsiSummary(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): DcsiSummary {
  const contexts: Partial<Record<DcsiDomainId, CdssDcsiDomainContext>> = {
    ...profile.dcsiDomainContexts,
  }
  if (!contexts.nephropathy) {
    contexts.nephropathy = inferredNephropathyContext(profile)
  }

  const domains: DcsiDomainAssessment[] = DOMAIN_ORDER.map((id) => {
    const scoring = DOMAIN_SCORE_CRITERIA[id]
    const shared = {
      id,
      label: DOMAIN_LABELS[id][locale === 'en' ? 'en' : 'zh'],
      maxScore: scoring.maxScore,
      scoreCriteria: scoring.criteria.map((criterion) => ({
        score: criterion.score,
        summary: criterion[locale === 'en' ? 'en' : 'zh'],
      })),
    }
    const context = validatedContext(id, contexts[id])
    if (!context) {
      return {
        ...shared,
        score: null,
        evidence: [],
        state: 'not-evaluable',
      }
    }

    return {
      ...shared,
      score: context.score,
      evidence: evidenceFromFacts(profile, locale, context.factKeys),
      state: 'assessed',
    }
  })

  const assessedDomains = domains.filter((domain) => domain.state === 'assessed')
  const minimumScore = assessedDomains.reduce((sum, domain) => sum + (domain.score ?? 0), 0)
  const isComplete = assessedDomains.length === DOMAIN_ORDER.length
  const headline = isComplete
    ? text(locale, `DCSI ${minimumScore}/13 分`, `DCSI ${minimumScore}/13`)
    : assessedDomains.length === 0
      ? text(locale, '目前無法計分', 'Not currently scorable')
      : text(locale, `已確認至少 ${minimumScore}/13 分`, `At least ${minimumScore}/13 confirmed`)

  return {
    method: 'updated-dcsi-icd10',
    minimumScore,
    maximumScore: 13,
    assessedDomainCount: assessedDomains.length,
    totalDomainCount: 7,
    isComplete,
    headline,
    interpretation: isComplete
      ? text(
          locale,
          '七類併發症均有可判讀資料；分數用於呈現整體疾病負荷與協助安排照護優先順序。',
          'All seven domains have evaluable data; use the score to summarize complication burden and support care prioritization.',
        )
      : assessedDomains.length === 0
        ? text(
            locale,
            '本次投影未帶入可判讀的 DCSI 併發症構面，因此不顯示 0 分；需先查找完整病歷。',
            'This data projection contains no evaluable DCSI complication domains. It is not reported as zero; review the full chart first.',
          )
      : text(
          locale,
          `目前只可判讀 ${assessedDomains.length}/7 類；未帶入的構面不視為 0 分，因此這是最低已確認分數，不是完整 DCSI。`,
          `Only ${assessedDomains.length}/7 domains are evaluable. Unavailable domains are not scored as zero, so this is a confirmed minimum rather than a complete DCSI.`,
        ),
    domains,
    limitations: [
      text(
        locale,
        '本 POC 是目前受治理診斷與檢驗的單次快照，未重建原研究使用的 12 個月申報資料觀察窗；需先確認跨院與時間範圍的資料完整性。',
        'This POC is a snapshot of currently governed diagnoses and laboratory results; it does not reconstruct the 12-month claims window used in the research method. Confirm cross-facility and longitudinal completeness.',
      ),
      text(
        locale,
        'ICD-10 診斷計分依 Glasheen 2017 Supplementary Appendix A-1～A-7；Procedure 判讀與 UACR（mg/g）門檻是本系統的 FHIR 延伸，尚未宣稱為該論文驗證內容。',
        'ICD-10 diagnosis scoring follows Glasheen 2017 Supplementary Appendix A-1–A-7. Procedure evidence and the UACR (mg/g) threshold are local FHIR extensions and are not claimed as validated by that publication.',
      ),
      text(
        locale,
        'DCSI 反映併發症負荷與群體層級預後關聯，不提供個人的絕對住院或死亡機率。',
        'DCSI reflects complication burden and population-level outcome associations; it does not provide an individual absolute probability of hospitalization or death.',
      ),
      text(
        locale,
        '分數不取代 ASCVD、心衰竭、CKD、眼病或足病的專病分期，也不單獨觸發藥物調整。',
        'The score does not replace condition-specific ASCVD, heart failure, CKD, eye, or foot staging and does not trigger medication changes on its own.',
      ),
    ],
    evidenceReferences: evidenceReferences(locale),
  }
}
