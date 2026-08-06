// Deterministic first-pass routing for tool-capable local models. Sending all
// production schemas on every turn costs thousands of input tokens and makes
// smaller models more likely to call unrelated tools. The explicit chat data
// scope is the authorization boundary; wording heuristics only reduce the
// already-authorized schemas and never grant a new data source.

import type { ChatDataScope } from '@/src/core/entities/chat-message.entity'

const TOOL_GROUPS = {
  patient: ['queryPatientInfo'],
  overview: ['getDataOverview'],
  encounters: ['queryEncounters', 'getRecentVisits', 'getEncounterDetails', 'listEncounterDepartments'],
  conditions: ['queryConditions'],
  labs: [
    'queryDiagnosticReports',
    'queryLabResultsByCategory',
    'queryObservations',
    'searchObservationByName',
    'listAvailableObservationCodes',
  ],
  imaging: ['queryImagingRecords'],
  procedures: ['queryProcedures'],
  medications: ['queryMedications', 'getActiveMedicationList'],
  allergies: ['queryAllergies'],
  immunizations: ['queryImmunizations'],
  literature: ['searchMedicalLiterature'],
} as const

type ToolGroup = keyof typeof TOOL_GROUPS

const NO_RECORD_QUERY = [
  /不要查(?:詢)?(?:病歷|病人資料|個案資料)/i,
  /不用查(?:詢)?(?:病歷|病人資料|個案資料)/i,
  /do not (?:query|search|look up).*(?:record|chart|patient data)/i,
]

const BROAD_HEALTH_SUMMARY_QUERY = [
  /(?:健康摘要|白話版.*健康|身體狀況.*(?:慢性疾病|用藥).*(?:檢驗|正常範圍))/i,
  /(?:overall|plain-language).*(?:health|patient).*(?:summary|record)/i,
]

const MEDICAL_EVIDENCE_QUERY = [
  /(?:指引|指南|共識|文獻|研究|證據|治療原則|臨床建議|guideline|consensus|literature|evidence|study|recommendation)/i,
]

const GENERAL_MEDICAL_KNOWLEDGE_QUERY = [
  ...MEDICAL_EVIDENCE_QUERY,
  /(?:是什麼|什麼是|如何治療|怎麼治療|有哪些(?:藥|藥物|治療)|副作用|交互作用|禁忌|適應症|衛教|what is|how (?:is|to)|side effects?|interaction|contraindication|treatment options?)/i,
]

const CURRENT_MEDICAL_EVIDENCE_QUERY = [
  /(?:最新|更新|新版本|現在|目前|近期|recent|latest|updated?|current|new version)/i,
]

const EXPLICIT_PATIENT_REFERENCE = [
  /(?:我的|我在|我有|我目前|我最近|我適合|我能否|我可以|我應該|對我|這位(?:病人|患者|個案)|病人|患者|個案|病歷|健康資料|健康存摺|匯入(?:的)?資料|根據.{0,20}(?:紀錄|資料))/i,
  /(?:\bmy\b|this patient|patient record|medical record|health record|imported data)/i,
]

const IMPLICIT_PATIENT_RECORD_QUERY = [
  /(?:請查|查詢|幫我查|替我查|紀錄中|資料中|是否有|有沒有|最近(?:一次|兩次|幾次|的)?|目前(?:的)?|住院期間|就醫期間|這次(?:就醫|住院)|分析目前狀況)/i,
  /(?:look up|check (?:my|the)|show me|do i have|latest|most recent|current (?:medication|diagnos|lab|result))/i,
]

function matchesAny(question: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(question))
}

export function isGeneralMedicalKnowledgeQuestion(question: string): boolean {
  return matchesAny(question, GENERAL_MEDICAL_KNOWLEDGE_QUERY)
}

export function isMedicalEvidenceQuestion(question: string): boolean {
  return matchesAny(question, MEDICAL_EVIDENCE_QUERY)
}

export function asksForCurrentMedicalEvidence(question: string): boolean {
  return isMedicalEvidenceQuestion(question) &&
    matchesAny(question, CURRENT_MEDICAL_EVIDENCE_QUERY)
}

export function explicitlyReferencesPatient(question: string): boolean {
  return matchesAny(question, EXPLICIT_PATIENT_REFERENCE)
}

export function implicitlyRequestsPatientRecord(question: string): boolean {
  return matchesAny(question, IMPLICIT_PATIENT_RECORD_QUERY)
}

export function agentToolNamesForDataScope(
  availableToolNames: readonly string[],
  dataScope: ChatDataScope,
): string[] {
  if (dataScope === 'auto') return [...availableToolNames]
  if (dataScope === 'general') {
    return availableToolNames.filter((name) => name === 'searchMedicalLiterature')
  }
  if (dataScope === 'patient') {
    return availableToolNames.filter((name) => name !== 'searchMedicalLiterature')
  }
  return [...availableToolNames]
}

const GROUP_TRIGGERS: Record<ToolGroup, RegExp[]> = {
  patient: [/(年齡|歲|性別|gender|age|demographic)/i],
  overview: [/(資料概況|資料總覽|有哪些類型|data overview|what data|available data)/i],
  encounters: [/(就醫|門診|急診|住院|出院|看診|科別|visit|encounter|admission|hospitali[sz])/i],
  conditions: [/(診斷|疾病|病況|問題清單|condition|diagnos)/i],
  labs: [/(檢驗|檢查值|數值|趨勢|血糖|血球|腎功能|肝功能|肌酸酐|觀察值|lab|test result|trend|HbA1c|WBC|creatinine|eGFR|marker)/i],
  imaging: [/(影像|放射|超音波|電腦斷層|核磁|X\s*光|攝影|imaging|radiology|ultrasound|CT|MRI|X\s*[-–—]?\s*ray)/i],
  procedures: [/(手術|處置|治療程序|procedure|surgery|operation)/i],
  medications: [/(藥|用藥|處方|服用|停藥|medication|medicine|prescription|drug)/i],
  allergies: [/(過敏|allerg)/i],
  immunizations: [/(疫苗|接種|immunization|vaccin)/i],
  literature: [/(文獻|研究|指引|證據|paper|literature|guideline|evidence)/i],
}

export function selectAgentToolNames(
  question: string,
  availableToolNames: readonly string[],
  dataScope: ChatDataScope,
): string[] {
  const scopeAllowedNames = agentToolNamesForDataScope(availableToolNames, dataScope)
  if (dataScope === 'auto') return scopeAllowedNames
  const generalKnowledge = isGeneralMedicalKnowledgeQuestion(question)
  const literatureOnly = () => scopeAllowedNames.filter((name) => name === 'searchMedicalLiterature')
  if (matchesAny(question, NO_RECORD_QUERY)) {
    return generalKnowledge ? literatureOnly() : []
  }
  if (
    dataScope !== 'general' &&
    scopeAllowedNames.includes('getHealthSummarySnapshot') &&
    BROAD_HEALTH_SUMMARY_QUERY.some((pattern) => pattern.test(question))
  ) {
    return ['getHealthSummarySnapshot']
  }
  const selected = new Set<string>()
  // A genuinely personalized evidence question needs a compact patient
  // snapshot in addition to literature (when literature is available).
  if (
    isMedicalEvidenceQuestion(question) &&
    dataScope !== 'general' &&
    scopeAllowedNames.includes('getHealthSummarySnapshot')
  ) {
    selected.add('getHealthSummarySnapshot')
  }
  ;(Object.keys(GROUP_TRIGGERS) as ToolGroup[]).forEach((group) => {
    if (GROUP_TRIGGERS[group].some((pattern) => pattern.test(question))) {
      TOOL_GROUPS[group].forEach((name) => selected.add(name))
    }
  })
  if (selected.size === 0) return scopeAllowedNames
  return scopeAllowedNames.filter((name) => selected.has(name))
}

export function filterAgentToolsForDataScope<T>(
  tools: Record<string, T> | undefined,
  dataScope: ChatDataScope,
): Record<string, T> | undefined {
  if (!tools) return tools
  const names = agentToolNamesForDataScope(Object.keys(tools), dataScope)
  return Object.fromEntries(
    names.flatMap((name) => name in tools ? [[name, tools[name]]] : []),
  )
}

export function selectAgentToolsForQuestion<T>(
  tools: Record<string, T> | undefined,
  question: string,
  dataScope: ChatDataScope,
): Record<string, T> | undefined {
  if (!tools) return tools
  const names = selectAgentToolNames(question, Object.keys(tools), dataScope)
  return Object.fromEntries(
    names.flatMap((name) => name in tools ? [[name, tools[name]]] : []),
  )
}

/** Force step zero when the user-selected scope authorizes a clear lookup.
 * This prevents smaller models from answering from pretrained/sample memory
 * without reading the bound source. Later steps return to auto so multi-domain
 * prompts (conditions + medications + labs) can continue querying as needed. */
export function forcedInitialAgentToolName(
  question: string,
  selectedToolNames: readonly string[],
  dataScope: ChatDataScope,
): string | undefined {
  if (selectedToolNames.length === 0) return undefined
  if (dataScope === 'auto') return undefined
  const generalKnowledge = isGeneralMedicalKnowledgeQuestion(question)
  if (matchesAny(question, NO_RECORD_QUERY)) {
    return generalKnowledge && selectedToolNames.includes('searchMedicalLiterature')
      ? 'searchMedicalLiterature'
      : undefined
  }
  if (dataScope === 'general') {
    return isMedicalEvidenceQuestion(question) && selectedToolNames.includes('searchMedicalLiterature')
      ? 'searchMedicalLiterature'
      : undefined
  }
  if (selectedToolNames.length === 1) return selectedToolNames[0]

  const priority: string[] = []
  if (isMedicalEvidenceQuestion(question)) {
    priority.push('getHealthSummarySnapshot')
  }
  if (BROAD_HEALTH_SUMMARY_QUERY.some((pattern) => pattern.test(question))) {
    priority.push('getHealthSummarySnapshot')
  }
  if (/(?:摘要|整理|健康狀況|summary|overview)/i.test(question)) {
    priority.push('queryConditions', 'getDataOverview')
  }
  if (/(?:診斷|疾病|慢性病|condition|diagnos)/i.test(question)) {
    priority.push('queryConditions')
  }
  if (/(?:目前用藥|現用藥|藥物|處方|medication|medicine|prescription|drug)/i.test(question)) {
    priority.push('getActiveMedicationList', 'queryMedications')
  }
  if (/(?:檢驗|檢查值|數值|lab|test result|marker)/i.test(question)) {
    priority.push('queryLabResultsByCategory', 'queryObservations')
  }
  if (/(?:影像|放射|超音波|電腦斷層|核磁|X\s*光|攝影|imaging|radiology|ultrasound|CT|MRI|X\s*[-–—]?\s*ray)/i.test(question)) {
    priority.push('queryImagingRecords')
  }
  if (/(?:就診|住院|急診|visit|encounter|admission)/i.test(question)) {
    priority.push('getRecentVisits', 'queryEncounters')
  }
  if (isMedicalEvidenceQuestion(question)) {
    priority.push('searchMedicalLiterature')
  }
  priority.push('queryPatientInfo', 'getDataOverview', ...selectedToolNames)
  return priority.find((name) => selectedToolNames.includes(name))
}

/**
 * A small local model is more reliable when compact, argument-free tools are
 * executed deterministically after routing. Keep the list intentionally short:
 * these tools are complete enough with `{}` and avoid letting a model invent a
 * date range or translate a source label while constructing arguments.
 * Frontier models never use this path because their data scope remains `auto`.
 */
const LOCAL_AGENT_PREFETCH_TOOLS = new Set([
  'getDataOverview',
  'getHealthSummarySnapshot',
  'getActiveMedicationList',
  'getRecentVisits',
  'queryImagingRecords',
])

export function shouldPreExecuteLocalAgentTool(
  initialToolName: string | undefined,
): boolean {
  return !!initialToolName && LOCAL_AGENT_PREFETCH_TOOLS.has(initialToolName)
}
