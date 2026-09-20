import type {
  ClinicalDataCollection,
  DiagnosticReportEntity,
  MedicationEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import { listClinicalDocuments } from '@/src/core/utils/clinical-documents.utils'

const CONDITION_CODE = /^(?:I(?:1[0-6]|2[0-5]|6[0-9]|70|73)|G45|E1[0-4]|E8881|N18|F17|Z(?:49|720|8249|992))/
const CONDITION_TEXT = /\b(?:ascvd|cad|acs|myocardial infarction|heart attack|mi|stroke|tia|pad|ckd|carotid|diabetes|diabetic|dm|hypertension|htn|smok(?:e|er|ing)|tobacco|family history|metabolic syndrome|dialysis|kidney replacement)\b|冠心|冠狀動脈|急性冠心|心肌梗塞|腦中風|腦梗塞|暫時性腦缺血|周邊動脈|頸動脈|動脈粥樣硬化|糖尿病|慢性腎|高血壓|吸菸|抽菸|家族史|代謝症候群|透析|腎臟替代/i
const VASCULAR_TEXT = /\b(?:coronary|carotid|peripheral arter|atherosclero|acute coronary|myocardial infarction|stroke|tia|cerebral infarct|angiograph|angioplast|revascular|stent|bypass|cabg|pci|calcium score|\bcac\b|ankle.?brachial|\babi\b)\b|冠狀動脈|冠心|頸動脈|周邊動脈|動脈粥樣硬化|心肌梗塞|急性冠心|腦中風|腦梗塞|血管攝影|血管成形|血管重建|支架|繞道|冠狀動脈鈣化/i
const PATHOLOGY_TEXT = /\b(?:pathology|histopathology|cytology|biopsy|tumou?r|neoplasm)\b|病理|組織學|細胞學|切片|腫瘤/i
const OBSERVATION_CODE = new Set([
  '2093-3', '18262-6', '13457-7', '2089-1', '2085-9', '2571-8',
  '2345-7', '4548-4', '85354-9', '8480-6', '8462-4', '8280-0',
  '2160-0', '33914-3', '48642-3', '62238-1', '14959-1', '9318-7', '43396-1',
  '72166-2',
])
const OBSERVATION_TEXT = /\b(?:total cholesterol|cholesterol,? total|ldl(?:-c)?|hdl(?:-c)?|triglycerides?|glucose|blood sugar|hba1c|hemoglobin a1c|glycated h(?:a)?emoglobin|blood pressure|systolic|diastolic|waist circumference|creatinine|eGFR|glomerular filtration|uacr|albumin.?creatinine ratio|smoking status|tobacco use|coronary artery calcium|calcium score|cac score)\b|總膽固醇|低密度脂蛋白|高密度脂蛋白|三酸甘油脂|三酸甘油酯|血糖|糖化血色素|血壓|收縮壓|舒張壓|腰圍|肌酸酐|腎絲球過濾率|尿白蛋白.*肌酸酐|吸菸狀態|冠狀動脈鈣化|冠脈鈣化|鈣化積分/i
const MEDICATION_TEXT = /\b(?:statin|atorvastatin|rosuvastatin|simvastatin|pravastatin|pitavastatin|fluvastatin|lovastatin|ezetimibe|evolocumab|alirocumab|inclisiran|bempedoic|fibrate|fenofibrate|gemfibrozil|omega.?3|niacin|cholestyramine|bile acid sequestrant|pcsk9|metformin|insulin|sulfonylurea|gliclazide|glimepiride|glinide|gliptin|flozin|sglt2|glp.?1|thiazolidinedione|pioglitazone|antihypertensive|hypotensive|ace inhibitor|angiotensin receptor blocker|\barb\b|losartan|valsartan|telmisartan|irbesartan|candesartan|olmesartan|lisinopril|enalapril|ramipril|perindopril|captopril|beta.?blocker|carvedilol|metoprolol|bisoprolol|atenolol|propranolol|calcium channel blocker|amlodipine|felodipine|nifedipine|diuretic|hydrochlorothiazide|indapamide|spironolactone)\b|降血脂|降膽固醇|降血糖|糖尿病用藥|胰島素|降血壓|降壓藥/i
const DIALYSIS_TEXT = /\b(?:dialysis|ha?emodialysis|peritoneal dialysis|kidney replacement|renal replacement)\b|透析|洗腎|腎臟替代/i

function collectText(value: unknown): string {
  const parts: string[] = []
  const seen = new WeakSet<object>()
  const visit = (current: unknown, key?: string) => {
    if (typeof current === 'string') {
      if (key !== 'data' && key !== 'url') parts.push(current)
      return
    }
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    if (Array.isArray(current)) current.forEach((item) => visit(item))
    else Object.entries(current).forEach(([childKey, child]) => visit(child, childKey))
  }
  visit(value)
  return parts.join(' ')
}

function normalizedCodes(value: unknown): string[] {
  const codes: string[] = []
  const seen = new WeakSet<object>()
  const visit = (current: unknown, key?: string) => {
    if (typeof current === 'string' && key === 'code') {
      codes.push(current.toUpperCase().replace(/[.\s]/g, ''))
      return
    }
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    if (Array.isArray(current)) current.forEach((item) => visit(item))
    else Object.entries(current).forEach(([childKey, child]) => visit(child, childKey))
  }
  visit(value)
  return codes
}

function relevantCondition(value: unknown): boolean {
  return normalizedCodes(value).some((code) => CONDITION_CODE.test(code))
    || CONDITION_TEXT.test(collectText(value))
}

function relevantObservation(observation: ObservationEntity): boolean {
  return normalizedCodes({ code: observation.code, component: observation.component })
    .some((code) => OBSERVATION_CODE.has(code))
    || OBSERVATION_TEXT.test(collectText({ code: observation.code, component: observation.component }))
}

function relevantMedication(medication: MedicationEntity): boolean {
  const atcCodes = [
    medication.drugTerminology?.atcCode,
    medication.drugTerminology?.atcLevel2Code,
    medication.drugTerminology?.atcLevel3Code,
    medication.drugTerminology?.atcLevel4Code,
    medication.atcClassification?.atcCode,
    medication.atcClassification?.atcLevel2Code,
    medication.atcClassification?.atcLevel3Code,
    medication.atcClassification?.atcLevel4Code,
  ].filter((code): code is string => Boolean(code)).map((code) => code.toUpperCase())
  return atcCodes.some((code) => /^(?:A10|C(?:02|03|07|08|09|10))/.test(code))
    || MEDICATION_TEXT.test(collectText({
      medicationCodeableConcept: medication.medicationCodeableConcept,
      medicationReference: medication.medicationReference,
      drugTerminology: medication.drugTerminology,
      atcClassification: medication.atcClassification,
      category: medication.category,
    }))
}

function relevantDocumentText(text: string): string {
  return text
    .split(/\n+|(?<=[。！？!?；;])\s*|(?<=\.)\s+|[,，|｜\t]+/)
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .filter((fragment) => (
      CONDITION_TEXT.test(fragment)
      || OBSERVATION_TEXT.test(fragment)
      || VASCULAR_TEXT.test(fragment)
      || MEDICATION_TEXT.test(fragment)
    ))
    .join('\n')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function referenceId(reference?: string): string | undefined {
  return reference?.split('/').pop()
}

function linkedEncounterIds(records: readonly unknown[]): Set<string> {
  const ids = new Set<string>()
  for (const record of records) {
    const candidate = record as {
      encounter?: { reference?: string }
      context?: { encounter?: Array<{ reference?: string }> }
    }
    const direct = referenceId(candidate.encounter?.reference)
    if (direct) ids.add(direct)
    for (const encounter of candidate.context?.encounter ?? []) {
      const id = referenceId(encounter.reference)
      if (id) ids.add(id)
    }
  }
  return ids
}

function filteredReport(
  report: DiagnosticReportEntity,
  relevantObservationIds: ReadonlySet<string>,
): DiagnosticReportEntity | null {
  const reportText = collectText({
    code: report.code,
    category: report.category,
    conclusion: report.conclusion,
    conclusionCode: report.conclusionCode,
    note: report.note,
  })
  const pathology = PATHOLOGY_TEXT.test(collectText({ code: report.code, category: report.category }))
  const narrativeRelevant = !pathology && VASCULAR_TEXT.test(reportText)
  const observations = (report._observations ?? []).filter((observation) => relevantObservation(observation))
  const results = (report.result ?? []).filter((result) => {
    const id = referenceId(result.reference)
    return !!id && relevantObservationIds.has(id)
  })
  if (!narrativeRelevant && observations.length === 0 && results.length === 0) return null
  return {
    ...report,
    ...(report._observations ? { _observations: observations } : {}),
    ...(report.result ? { result: results } : {}),
    ...(!narrativeRelevant && report.code ? { code: undefined } : {}),
    ...(!narrativeRelevant && report.conclusion ? { conclusion: undefined } : {}),
    ...(!narrativeRelevant && report.note ? { note: undefined } : {}),
  }
}

/**
 * Minimum-necessary source view for NHI Table 1 evidence extraction.
 *
 * It is applied before context formatting, signatures and source-catalog
 * construction, so an excluded CBC/pathology record cannot re-enter through a
 * citation or metadata side channel. Demographics live outside this collection
 * and continue to come from the selected Patient resource.
 */
export function scopeClinicalDataForNhiLipidAi(
  input: Partial<ClinicalDataCollection>,
): Partial<ClinicalDataCollection> {
  const observations = (input.observations ?? []).filter(relevantObservation)
  const vitalSigns = (input.vitalSigns ?? []).filter(relevantObservation)
  const relevantObservationIds = new Set(
    [...observations, ...vitalSigns]
      .map((observation) => observation.id)
      .filter((id): id is string => Boolean(id)),
  )
  const diagnosticReports = (input.diagnosticReports ?? [])
    .map((report) => filteredReport(report, relevantObservationIds))
    .filter((report): report is DiagnosticReportEntity => Boolean(report))
  const linkedImagingStudyIds = new Set(
    diagnosticReports.flatMap((report) => report.imagingStudy ?? [])
      .map((reference) => referenceId(reference.reference))
      .filter((id): id is string => Boolean(id)),
  )
  const imagingStudies = (input.imagingStudies ?? []).filter((study) => {
    const studyText = collectText({
      procedureCode: study.procedureCode,
      procedureReference: study.procedureReference,
      description: study.description,
      series: study.series,
      note: study.note,
    })
    return linkedImagingStudyIds.has(study.id)
      || (!PATHOLOGY_TEXT.test(studyText) && VASCULAR_TEXT.test(studyText))
  })
  const procedures = (input.procedures ?? []).filter((procedure) => {
    const procedureText = collectText({
      category: procedure.category,
      code: procedure.code,
      note: procedure.note,
    })
    return VASCULAR_TEXT.test(procedureText) || DIALYSIS_TEXT.test(procedureText)
  })
  const conditions = (input.conditions ?? []).filter(relevantCondition)
  const medications = (input.medications ?? []).filter(relevantMedication)

  const relevantDocumentTextById = new Map(
    listClinicalDocuments({
      compositions: input.compositions,
      documentReferences: input.documentReferences,
    }).map((document) => [
      document.id,
      PATHOLOGY_TEXT.test(document.title) ? '' : relevantDocumentText(document.text),
    ] as const).filter((entry) => Boolean(entry[1])),
  )
  const compositions = (input.compositions ?? []).flatMap((document) => {
    const text = relevantDocumentTextById.get(document.id)
    return text ? [{
      ...document,
      text: {
        status: document.text?.status ?? 'generated',
        div: `<div>${escapeHtml(text).replaceAll('\n', '<br />')}</div>`,
      },
      section: [],
    }] : []
  })
  const documentReferences = (input.documentReferences ?? []).flatMap((document) => {
    const text = relevantDocumentTextById.get(document.id)
    return text ? [{ ...document, description: text, content: [] }] : []
  })
  const relevantEncounterIds = linkedEncounterIds([
    ...conditions,
    ...medications,
    ...observations,
    ...vitalSigns,
    ...diagnosticReports,
    ...procedures,
    ...compositions,
    ...documentReferences,
  ])
  const encounters = (input.encounters ?? []).filter((encounter) => {
    const clinicalReason = {
      type: encounter.type,
      serviceType: encounter.serviceType,
      reasonCode: encounter.reasonCode,
      reasonReference: encounter.reasonReference,
      diagnosis: encounter.diagnosis,
    }
    return relevantEncounterIds.has(encounter.id)
      || relevantCondition(clinicalReason)
      || VASCULAR_TEXT.test(collectText(clinicalReason))
  })

  return {
    ...input,
    conditions,
    medications,
    medicationRemainingSummaries: [],
    observations,
    vitalSigns,
    diagnosticReports,
    imagingStudies,
    procedures,
    encounters,
    compositions,
    documentReferences,
    allergies: [],
    immunizations: [],
    consents: [],
    devices: [],
    carePlans: [],
  }
}
