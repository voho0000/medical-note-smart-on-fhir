// Deterministic first-pass routing for tool-capable local models. Sending all
// production schemas on every turn costs thousands of input tokens and makes
// smaller models more likely to call unrelated tools. Unknown/broad questions
// fail open to the full tool set so routing cannot hide a needed capability.

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

const GROUP_TRIGGERS: Record<ToolGroup, RegExp[]> = {
  patient: [/(年齡|歲|性別|gender|age|demographic)/i],
  overview: [/(資料概況|資料總覽|有哪些類型|data overview|what data|available data)/i],
  encounters: [/(就醫|門診|急診|住院|出院|看診|科別|visit|encounter|admission|hospitali[sz])/i],
  conditions: [/(診斷|疾病|病況|問題清單|condition|diagnos)/i],
  labs: [/(檢驗|檢查值|數值|趨勢|血糖|血球|腎功能|肝功能|肌酸酐|觀察值|lab|test result|trend|HbA1c|WBC|creatinine|eGFR|marker)/i],
  imaging: [/(影像|放射|超音波|電腦斷層|核磁|X光|攝影|imaging|radiology|ultrasound|CT|MRI|X-ray)/i],
  procedures: [/(手術|處置|治療程序|procedure|surgery|operation)/i],
  medications: [/(藥|用藥|處方|服用|停藥|medication|medicine|prescription|drug)/i],
  allergies: [/(過敏|allerg)/i],
  immunizations: [/(疫苗|接種|immunization|vaccin)/i],
  literature: [/(文獻|研究|指引|證據|paper|literature|guideline|evidence)/i],
}

export function selectAgentToolNames(
  question: string,
  availableToolNames: readonly string[],
): string[] {
  if (NO_RECORD_QUERY.some((pattern) => pattern.test(question))) return []
  const selected = new Set<string>()
  ;(Object.keys(GROUP_TRIGGERS) as ToolGroup[]).forEach((group) => {
    if (GROUP_TRIGGERS[group].some((pattern) => pattern.test(question))) {
      TOOL_GROUPS[group].forEach((name) => selected.add(name))
    }
  })
  if (selected.size === 0) return [...availableToolNames]
  return availableToolNames.filter((name) => selected.has(name))
}

export function selectAgentToolsForQuestion<T>(
  tools: Record<string, T> | undefined,
  question: string,
): Record<string, T> | undefined {
  if (!tools) return tools
  const names = selectAgentToolNames(question, Object.keys(tools))
  return Object.fromEntries(
    names.flatMap((name) => name in tools ? [[name, tools[name]]] : []),
  )
}

/** Force step zero for an explicit patient-record question. This prevents
 * smaller models from answering from pretrained/sample memory without ever
 * reading the bound chart. Later steps return to auto so multi-domain prompts
 * (conditions + medications + labs) can continue querying as needed. */
export function forcedInitialAgentToolName(
  question: string,
  selectedToolNames: readonly string[],
): string | undefined {
  if (selectedToolNames.length === 0) return undefined
  if (NO_RECORD_QUERY.some((pattern) => pattern.test(question))) return undefined
  const explicitlyRequestsPatientData =
    /(?:病人|病歷|健康資料|健康存摺|匯入|目前|最近|我的|這位|patient|record|current|recent|history)/i.test(question)
  if (!explicitlyRequestsPatientData) return undefined
  if (selectedToolNames.length === 1) return selectedToolNames[0]

  const priority: string[] = []
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
  if (/(?:就診|住院|急診|visit|encounter|admission)/i.test(question)) {
    priority.push('getRecentVisits', 'queryEncounters')
  }
  priority.push('queryPatientInfo', 'getDataOverview', ...selectedToolNames)
  return priority.find((name) => selectedToolNames.includes(name))
}
