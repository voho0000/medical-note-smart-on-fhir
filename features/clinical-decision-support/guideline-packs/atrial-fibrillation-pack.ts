import {
  calculateDocumentedCha2ds2Vasc,
  type Cha2ds2VascAssessment,
} from '../risk-stratification/atrial-fibrillation'
import type {
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

function guidelineReference(locale: CdssLocale): GuidelineReference {
  return {
    id: 'acc-aha-accp-hrs-af-2023-antithrombotic-therapy',
    title: '2023 ACC/AHA/ACCP/HRS Guideline for the Diagnosis and Management of Atrial Fibrillation',
    publisher: 'ACC/AHA/ACCP/HRS',
    version: '2023',
    url: 'https://www.heart.org/-/media/Files/Professional/Quality-Improvement/Get-With-the-Guidelines/Get-With-The-Guidelines-AFIB/AFib-Month/joglaretal20232023accahaaccphrsguidelineforthediagnosisandmanagementofatrialfibrillation.pdf',
    recommendationId: 'Section 6.3.1',
    locator: 'Antithrombotic therapy',
    summary: text(
      locale,
      '年血栓栓塞風險約 ≥2%（例如 CHA₂DS₂-VASc 男性 ≥2、女性 ≥3）建議抗凝；中間風險可合理考慮。無中重度風濕性二尖瓣狹窄或機械瓣時 DOAC 優於 warfarin；出血分數不可單獨用來拒絕抗凝。',
      'Anticoagulation is recommended at an estimated annual thromboembolic risk of about 2% or more (for example, CHA₂DS₂-VASc at least 2 in men or 3 in women) and is reasonable at intermediate risk. DOACs are preferred over warfarin without moderate-to-severe rheumatic mitral stenosis or a mechanical valve, and bleeding scores must not be used alone to deny anticoagulation.',
    ),
  }
}

function assessment(profile: CdssPatientProfile): Cha2ds2VascAssessment {
  return calculateDocumentedCha2ds2Vasc({
    age: profile.facts.age?.numericValue,
    sex: profile.demographics?.sex,
    congestiveHeartFailure: Boolean(profile.facts.heartFailureDiagnosis),
    hypertension: Boolean(profile.facts.hypertensionDiagnosis),
    diabetes: Boolean(profile.facts.type2DiabetesDiagnosis),
    priorStrokeTiaThromboembolism: Boolean(profile.facts.priorStrokeTiaEmbolism),
    vascularDisease: Boolean(profile.facts.vascularDisease),
  })
}

function componentSummary(
  result: Cha2ds2VascAssessment,
  locale: CdssLocale,
): string {
  const labels = {
    'heart-failure': text(locale, '心衰竭', 'heart failure'),
    hypertension: text(locale, '高血壓', 'hypertension'),
    age: text(locale, '年齡', 'age'),
    diabetes: text(locale, '糖尿病', 'diabetes'),
    'stroke-tia-embolism': text(locale, '中風／TIA／栓塞', 'stroke/TIA/embolism'),
    'vascular-disease': text(locale, '血管疾病', 'vascular disease'),
    'sex-category': text(locale, '女性性別類別', 'female sex category'),
  } as const
  const positive = result.components.filter((item) => item.points > 0)
  return positive.length > 0
    ? positive.map((item) => `${labels[item.id]} +${item.points}`).join('、')
    : text(locale, '此資料切片未證實其他計分項', 'No additional scoring component was established in this data slice')
}

function buildStrokeRisk(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const result = assessment(profile)
  const meets = result.threshold === 'oral-anticoagulation-recommended'
  const intermediate = result.threshold === 'oral-anticoagulation-reasonable'
  const incomplete = result.threshold === 'threshold-not-evaluable'

  return {
    id: 'af-documented-cha2ds2-vasc',
    kind: 'risk-stratification',
    domain: 'target',
    priority: meets ? 'high' : 'medium',
    status: incomplete ? 'needs-data' : meets || intermediate ? 'review' : 'needs-data',
    overviewEvidenceFactKey: 'atrialFibrillationDiagnosis',
    title: text(
      locale,
      `病歷可證實的 CHA₂DS₂-VASc 最低分：${result.score} 分`,
      `Documented minimum CHA₂DS₂-VASc score: ${result.score}`,
    ),
    recommendation: meets
      ? text(locale, '已達指引舉例的抗凝建議門檻；核對完整病史與禁忌後評估口服抗凝。', 'The documented minimum reaches the guideline example threshold for anticoagulation; verify the complete history and contraindications before assessing oral anticoagulation.')
      : intermediate
        ? text(locale, '落在可合理考慮抗凝的中間風險；結合其他風險修飾因子與共同決策。', 'The documented minimum is in the intermediate range where anticoagulation is reasonable; use additional risk modifiers and shared decision-making.')
        : text(locale, '先補齊人口學與未整合病史；低的「最低分」不能用來宣告不需抗凝。', 'Complete demographics and unintegrated history first; a low minimum score cannot establish that anticoagulation is unnecessary.'),
    rationale: text(
      locale,
      `計分依據：${componentSummary(result, locale)}。只有可治理資料中明確存在的項目才加分。`,
      `Scoring basis: ${componentSummary(result, locale)}. Points are added only for components explicitly established in governed data.`,
    ),
    patientEvidence: compact([
      evidence(profile, locale, 'atrialFibrillationDiagnosis', 'AF／flutter', 'AF/flutter'),
      evidence(profile, locale, 'age', '年齡', 'Age'),
      evidence(profile, locale, 'sex', '性別', 'Sex'),
      evidence(profile, locale, 'heartFailureDiagnosis', '心衰竭', 'Heart failure'),
      evidence(profile, locale, 'hypertensionDiagnosis', '高血壓', 'Hypertension'),
      evidence(profile, locale, 'type2DiabetesDiagnosis', '第二型糖尿病', 'Type 2 diabetes'),
      evidence(profile, locale, 'priorStrokeTiaEmbolism', '中風／TIA／栓塞', 'Stroke/TIA/embolism'),
      evidence(profile, locale, 'vascularDisease', '血管疾病', 'Vascular disease'),
    ]),
    missingData: [
      ...result.missingDemographics.map((item) => item === 'age'
        ? text(locale, '年齡', 'Age')
        : text(locale, '可用於門檻判讀的性別資料', 'Sex data for threshold interpretation')),
      text(locale, '完整跨院共病史；未出現在資料切片的項目仍屬未知', 'Complete cross-facility comorbidity history; components absent from the data slice remain unknown'),
    ],
    nextActions: [text(locale, '由臨床人員核對每一計分項並記錄最終風險評估。', 'Have a clinician verify every component and document the final risk assessment.')],
    guidelineReferences: [guidelineReference(locale)],
    safetyBoundary: text(locale, '這是「已證實最低分」，不是完整自動計分；不得把缺少的診斷當成 0 分陰性證據。', 'This is a documented minimum, not a complete automated score; absent diagnoses must not be treated as negative zero-point evidence.'),
  }
}

function buildAnticoagulationConcordance(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const risk = assessment(profile)
  const oralAnticoagulant = Boolean(profile.facts.currentOralAnticoagulant)
  const recommended = risk.threshold === 'oral-anticoagulation-recommended'
  const intermediate = risk.threshold === 'oral-anticoagulation-reasonable'
  const antiplateletOnly = !oralAnticoagulant && Boolean(profile.facts.currentAntiplatelet)

  return {
    id: 'af-anticoagulation-concordance',
    domain: 'medication',
    priority: recommended && !oralAnticoagulant ? 'high' : 'medium',
    status: recommended && !oralAnticoagulant
      ? 'actionable'
      : recommended || intermediate || oralAnticoagulant
        ? 'review'
        : 'needs-data',
    overviewEvidenceFactKey: oralAnticoagulant
      ? 'currentOralAnticoagulant'
      : antiplateletOnly
        ? 'currentAntiplatelet'
        : 'atrialFibrillationDiagnosis',
    title: recommended && !oralAnticoagulant
      ? text(locale, '已達抗凝建議門檻，但可見清單未辨識到口服抗凝', 'Anticoagulation threshold reached, but no oral anticoagulant is identified in the visible list')
      : oralAnticoagulant
        ? text(locale, '已有口服抗凝紀錄：核對適應症、實際使用與安全性', 'Oral anticoagulant recorded: reconcile indication, actual use, and safety')
        : text(locale, '抗凝適切性需要補齊風險與用藥資料', 'Anticoagulation appropriateness requires additional risk and medication data'),
    recommendation: antiplateletOnly && recommended
      ? text(locale, '確認是否以抗血小板藥替代 AF 抗凝；在沒有其他抗血小板適應症時，aspirin 單獨或合併 clopidogrel 不是抗凝替代方案。', 'Determine whether antiplatelet therapy is being used instead of AF anticoagulation. Without another antiplatelet indication, aspirin alone or with clopidogrel is not an alternative to anticoagulation.')
      : text(locale, '核對完整處方、病人實際服用、拒藥／停藥原因、禁忌與共同決策紀錄，再判斷是否有照護缺口。', 'Reconcile the complete prescription history, actual use, refusal/stop reason, contraindications, and shared-decision record before labeling a care gap.'),
    rationale: text(locale, '風險門檻與可見處方的落差是查核提示，不等同未治療或不遵從。', 'A mismatch between the risk threshold and visible prescriptions is a verification prompt, not proof of undertreatment or nonadherence.'),
    patientEvidence: compact([
      evidence(profile, locale, 'currentOralAnticoagulant', '口服抗凝', 'Oral anticoagulant'),
      evidence(profile, locale, 'currentAntiplatelet', '抗血小板藥', 'Antiplatelet'),
      evidence(profile, locale, 'medicationListOverview', '可見用藥', 'Visible medication list'),
    ]),
    missingData: [
      text(locale, '完整抗凝處方、實際服用與停藥／拒藥原因', 'Complete anticoagulant history, actual use, and stop/refusal reason'),
      text(locale, '其他抗血小板適應症與共同決策紀錄', 'Other antiplatelet indications and shared-decision record'),
    ],
    nextActions: [text(locale, '由開方醫師或藥師完成抗栓用藥核對並記錄結論。', 'Have the prescriber or pharmacist reconcile antithrombotic therapy and document the conclusion.')],
    guidelineReferences: [guidelineReference(locale)],
    safetyBoundary: text(locale, '系統不會自動開始或停止抗凝；可見處方缺席不等於病人沒有使用。', 'The system never starts or stops anticoagulation automatically; absence from the visible list does not prove nonuse.'),
  }
}

function buildAgentSafety(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const doac = Boolean(profile.facts.currentDoac)
  const warfarin = Boolean(profile.facts.currentVitaminKAntagonist)
  const rheumaticMs = Boolean(profile.facts.rheumaticMitralStenosis)
  const prostheticValve = Boolean(profile.facts.prostheticHeartValve)
  const eGfr = profile.facts.eGFR?.numericValue
  const conflict = doac && rheumaticMs

  return {
    id: 'af-anticoagulant-selection-safety',
    domain: 'safety',
    priority: conflict ? 'high' : doac || warfarin ? 'medium' : 'routine',
    status: conflict ? 'actionable' : doac || warfarin || prostheticValve ? 'review' : 'needs-data',
    overviewEvidenceFactKey: conflict
      ? 'rheumaticMitralStenosis'
      : doac
        ? 'currentDoac'
        : warfarin
          ? 'currentVitaminKAntagonist'
          : 'eGFR',
    title: conflict
      ? text(locale, 'DOAC 與風濕性二尖瓣狹窄紀錄並存：立即核對', 'DOAC and rheumatic mitral stenosis records coexist: verify promptly')
      : prostheticValve
        ? text(locale, '人工瓣膜種類未確定：抗凝選擇前需核對', 'Prosthetic valve type is unknown: verify before selecting anticoagulation')
        : text(locale, '完成抗凝藥物選擇與腎功能劑量安全檢核', 'Complete anticoagulant selection and kidney-dose safety review'),
    recommendation: text(
      locale,
      '核對是否有中重度風濕性二尖瓣狹窄或機械瓣，並依實際藥品、劑量、年齡、體重、腎／肝功能、交互作用與適應症檢核；本模組不自動建議特定劑量。',
      'Verify moderate-to-severe rheumatic mitral stenosis or a mechanical valve, then check the actual drug and dose against age, weight, kidney/liver function, interactions, and indication. This module does not calculate a drug-specific dose.',
    ),
    rationale: text(locale, 'DOAC 一般優於 warfarin，但風濕性二尖瓣狹窄與機械瓣是關鍵例外；不同 DOAC 的減量條件不同。', 'DOACs are generally preferred over warfarin, with rheumatic mitral stenosis and mechanical valves as key exceptions; dose-reduction criteria differ by DOAC.'),
    patientEvidence: compact([
      evidence(profile, locale, 'currentDoac', 'DOAC', 'DOAC'),
      evidence(profile, locale, 'currentVitaminKAntagonist', 'VKA', 'VKA'),
      evidence(profile, locale, 'rheumaticMitralStenosis', '風濕性二尖瓣狹窄', 'Rheumatic mitral stenosis'),
      evidence(profile, locale, 'prostheticHeartValve', '人工瓣膜狀態', 'Prosthetic valve status'),
      evidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      evidence(profile, locale, 'bodyWeight', '體重', 'Body weight'),
      evidence(profile, locale, 'INR', 'INR', 'INR'),
    ]),
    missingData: [
      ...(prostheticValve ? [text(locale, '人工瓣膜為機械瓣或生物瓣', 'Whether the prosthetic valve is mechanical or bioprosthetic')] : []),
      ...(typeof eGfr !== 'number' ? [text(locale, '近期腎功能', 'Recent kidney function')] : []),
      text(locale, '實際藥名、劑量、服用頻率、交互作用與肝功能', 'Actual drug, dose, frequency, interactions, and liver function'),
    ],
    nextActions: [text(locale, '逐項核對標示與院內抗凝流程，必要時由藥師共同審查。', 'Check the product-specific criteria and institutional anticoagulation pathway, with pharmacist review when needed.')],
    guidelineReferences: [guidelineReference(locale)],
    safetyBoundary: text(locale, 'Z95.2 只能證實人工瓣膜狀態，不能自動判定為機械瓣；系統不做劑量處方。', 'Z95.2 establishes prosthetic-valve status but does not identify a mechanical valve; the system does not prescribe a dose.'),
  }
}

function buildBleedingReview(
  profile: CdssPatientProfile,
  locale: CdssLocale,
): CdssRecommendation {
  const hasBleed = Boolean(profile.facts.majorBleedingHistory)
  const nsaid = Boolean(profile.facts.currentNsaid)
  const antiplatelet = Boolean(profile.facts.currentAntiplatelet)
  const modifiable = nsaid || antiplatelet
  const keyLabsPresent = Boolean(
    profile.facts.hemoglobin
    && profile.facts.plateletCount
    && profile.facts.eGFR,
  )

  return {
    id: 'af-bleeding-risk-data-gaps',
    domain: 'safety',
    priority: hasBleed || modifiable ? 'high' : 'medium',
    status: hasBleed || modifiable ? 'review' : keyLabsPresent ? 'review' : 'needs-data',
    overviewEvidenceFactKey: hasBleed
      ? 'majorBleedingHistory'
      : nsaid
        ? 'currentNsaid'
        : antiplatelet
          ? 'currentAntiplatelet'
          : 'hemoglobin',
    title: hasBleed || modifiable
      ? text(locale, '辨識到出血風險線索：優先處理可修正因子', 'Bleeding-risk clues identified: prioritize modifiable factors')
      : text(locale, '抗凝前／追蹤中的出血風險資料仍需結構化補齊', 'Bleeding-risk data should be completed before and during anticoagulation'),
    recommendation: text(
      locale,
      '檢視既往重大出血、血壓、Hb／血小板、腎肝功能、NSAID／抗血小板藥、酒精、跌倒／衰弱與 warfarin INR 控制；先修正可改變因子。',
      'Review prior major bleeding, blood pressure, hemoglobin/platelets, kidney/liver function, NSAID/antiplatelet use, alcohol, falls/frailty, and warfarin INR control; address modifiable factors first.',
    ),
    rationale: text(locale, '出血評分可協助找風險因子，但不可單獨用來拒絕有抗凝適應症的病人。', 'Bleeding scores can identify risk factors but must not be used alone to deny anticoagulation when indicated.'),
    patientEvidence: compact([
      evidence(profile, locale, 'majorBleedingHistory', '重大出血病史', 'Major bleeding history'),
      evidence(profile, locale, 'hemoglobin', 'Hb', 'Hemoglobin'),
      evidence(profile, locale, 'plateletCount', '血小板', 'Platelets'),
      evidence(profile, locale, 'eGFR', 'eGFR', 'eGFR'),
      evidence(profile, locale, 'currentNsaid', 'NSAID', 'NSAID'),
      evidence(profile, locale, 'currentAntiplatelet', '抗血小板藥', 'Antiplatelet'),
      evidence(profile, locale, 'INR', 'INR', 'INR'),
    ]),
    missingData: [
      ...(!profile.facts.hemoglobin ? [text(locale, 'CBC／Hb', 'CBC/hemoglobin')] : []),
      ...(!profile.facts.plateletCount ? [text(locale, '血小板', 'Platelets')] : []),
      ...(!profile.facts.eGFR ? [text(locale, '腎功能', 'Kidney function')] : []),
      text(locale, '未控制高血壓、酒精、跌倒／衰弱與完整肝功能', 'Uncontrolled hypertension, alcohol, falls/frailty, and complete liver function'),
      ...(profile.facts.currentVitaminKAntagonist ? [text(locale, 'warfarin TTR／INR 穩定度', 'Warfarin TTR/INR stability')] : []),
    ],
    nextActions: [text(locale, '記錄可修正因子、處理方案與追蹤頻率；不要只留下總分。', 'Document modifiable factors, mitigation, and follow-up frequency rather than only a total score.')],
    guidelineReferences: [guidelineReference(locale)],
    safetyBoundary: text(locale, '本模組不以不完整資料自動產生 HAS-BLED，也不以出血風險單獨否決抗凝。', 'This module does not auto-calculate HAS-BLED from incomplete data and never uses bleeding risk alone to deny anticoagulation.'),
  }
}

export const ATRIAL_FIBRILLATION_GUIDELINE_PACK: ClinicalGuidelinePack = {
  id: 'atrial-fibrillation-cdss',
  diseaseCode: 'AF',
  version: '1.0.0',
  enabled: true,
  label: { zh: 'AF 抗凝', en: 'AF anticoagulation' },
  applies(profile) {
    return Boolean(profile.facts.atrialFibrillationDiagnosis)
  },
  build({ profile, locale }) {
    const recommendations = [
      buildStrokeRisk(profile, locale),
      buildAnticoagulationConcordance(profile, locale),
      buildAgentSafety(profile, locale),
      buildBleedingReview(profile, locale),
    ]
    return {
      title: text(locale, '心房顫動抗凝適切性與出血風險資料缺口', 'AF anticoagulation appropriateness and bleeding-risk data gaps'),
      summary: text(locale, '以已證實最低風險、可見抗栓用藥與安全資料缺口形成可核對的決策路徑。', 'Builds a verifiable decision pathway from documented minimum risk, visible antithrombotic therapy, and safety-data gaps.'),
      packId: 'atrial-fibrillation-cdss',
      packVersion: '1.0.0',
      knowledgePacks: [{
        id: 'acc-aha-af-2023',
        kind: 'guideline',
        label: '2023 ACC/AHA/ACCP/HRS AF',
        version: '2023',
        effectiveFrom: '2023-11-30',
      }],
      recommendations,
      notEvaluated: [
        text(locale, 'AF 型態／負荷、完整超音波瓣膜資料、機械瓣種類、所有跨院用藥、實際服藥、跌倒／衰弱、酒精與共同決策內容。', 'AF pattern/burden, complete echocardiographic valve data, mechanical-valve type, all cross-facility medications, actual adherence, falls/frailty, alcohol, and shared-decision content.'),
      ],
      disclaimer: text(locale, '唯讀決策支援；不是抗凝處方、停藥指示或完整風險評估。所有用藥決策須由臨床人員核對完整病歷。', 'Read-only decision support; not an anticoagulant prescription, stop instruction, or complete risk assessment. Clinicians must verify the complete chart before medication decisions.'),
    }
  },
}
