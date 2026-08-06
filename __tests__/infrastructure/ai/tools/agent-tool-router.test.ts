import {
  asksForCurrentMedicalEvidence,
  explicitlyReferencesPatient,
  forcedInitialAgentToolName,
  implicitlyRequestsPatientRecord,
  isGeneralMedicalKnowledgeQuestion,
  selectAgentToolNames,
  selectAgentToolsForQuestion,
  shouldPreExecuteLocalAgentTool,
} from '@/src/infrastructure/ai/tools/agent-tool-router'

const names = [
  'queryPatientInfo',
  'getDataOverview',
  'getHealthSummarySnapshot',
  'queryEncounters',
  'getRecentVisits',
  'getEncounterDetails',
  'queryImagingRecords',
  'queryDiagnosticReports',
  'queryLabResultsByCategory',
  'queryObservations',
  'searchObservationByName',
  'listAvailableObservationCodes',
  'queryProcedures',
  'queryMedications',
  'getActiveMedicationList',
  'queryAllergies',
  'queryImmunizations',
  'searchMedicalLiterature',
]

describe('agent tool router', () => {
  it('routes a lab trend question to lab tools only', () => {
    const selected = selectAgentToolNames('請查最近兩次 HbA1c 的數值與趨勢', names, 'patient')
    expect(selected).toContain('searchObservationByName')
    expect(selected).toContain('queryDiagnosticReports')
    expect(selected).not.toContain('queryProcedures')
    expect(selected).not.toContain('queryAllergies')
  })

  it('combines encounter and lab groups for an inpatient lab question', () => {
    const selected = selectAgentToolNames('住院期間有哪些檢驗結果？', names, 'patient')
    expect(selected).toContain('queryEncounters')
    expect(selected).toContain('getEncounterDetails')
    expect(selected).toContain('queryDiagnosticReports')
    expect(selected).not.toContain('queryImmunizations')
  })

  it('removes tools when the user explicitly says not to query records', () => {
    expect(selectAgentToolNames('不要查詢病歷，請解釋 HbA1c', names, 'patient')).toEqual([])
  })

  it('fails open to every available tool for an unknown broad question', () => {
    expect(selectAgentToolNames('請協助分析目前狀況', names, 'patient'))
      .toEqual(names.filter((name) => name !== 'searchMedicalLiterature'))
  })

  it('returns the routed tool object without changing tool values', () => {
    const tools = Object.fromEntries(names.map((name) => [name, { name }]))
    const selected = selectAgentToolsForQuestion(tools, '是否有 Penicillin 過敏？', 'patient')
    expect(Object.keys(selected ?? {})).toEqual(['queryAllergies'])
    expect(selected?.queryAllergies).toBe(tools.queryAllergies)
  })

  it('forces an unambiguous patient-data lookup but not a general explanation', () => {
    expect(forcedInitialAgentToolName('請查這位病人的性別與年齡', ['queryPatientInfo'], 'patient'))
      .toBe('queryPatientInfo')
    expect(forcedInitialAgentToolName('請解釋性別欄位的意思', [], 'general'))
      .toBeUndefined()
    expect(forcedInitialAgentToolName('不要查詢病歷，請解釋過敏', ['queryAllergies'], 'patient'))
      .toBeUndefined()
  })

  it('forces a grounding tool for a broad multi-domain patient summary', () => {
    expect(forcedInitialAgentToolName(
      '請用我匯入的健康資料整理慢性疾病、目前用藥與檢驗摘要',
      ['queryConditions', 'queryLabResultsByCategory', 'getActiveMedicationList'],
      'patient',
    )).toBe('queryConditions')
  })

  it('routes a broad imported-record summary to the compact snapshot when available', () => {
    const question = '請用我匯入的健康資料，整理最近身體狀況、慢性疾病、目前用藥，以及超出正常範圍的檢驗數值。'
    expect(selectAgentToolNames(question, names, 'patient')).toEqual(['getHealthSummarySnapshot'])
    expect(forcedInitialAgentToolName(question, ['getHealthSummarySnapshot'], 'patient'))
      .toBe('getHealthSummarySnapshot')
  })

  it('never exposes FHIR tools for a general guideline update question', () => {
    const question = '目前糖尿病用藥 guideline 有什麼更新？'
    const fhirOnlyNames = names.filter((name) => name !== 'searchMedicalLiterature')

    expect(isGeneralMedicalKnowledgeQuestion(question)).toBe(true)
    expect(asksForCurrentMedicalEvidence(question)).toBe(true)
    expect(explicitlyReferencesPatient(question)).toBe(false)
    expect(selectAgentToolNames(question, fhirOnlyNames, 'general')).toEqual([])
    expect(forcedInitialAgentToolName(question, [], 'general')).toBeUndefined()
  })

  it('routes a general guideline question only to literature when available', () => {
    const question = '現在糖尿病 guideline 有什麼更新？'

    expect(selectAgentToolNames(question, names, 'general')).toEqual(['searchMedicalLiterature'])
    expect(forcedInitialAgentToolName(question, ['searchMedicalLiterature'], 'general'))
      .toBe('searchMedicalLiterature')
  })

  it('allows a compact patient snapshot only when evidence advice is explicitly personalized', () => {
    const question = '請根據我的病歷，說明最新糖尿病 guideline 對我有什麼影響。'
    const selected = selectAgentToolNames(question, names, 'patient-literature')

    expect(explicitlyReferencesPatient(question)).toBe(true)
    expect(selected).toEqual(['getHealthSummarySnapshot', 'searchMedicalLiterature'])
    expect(forcedInitialAgentToolName(question, selected, 'patient-literature')).toBe('getHealthSummarySnapshot')
  })

  it.each([
    'HbA1c 是什麼？',
    'Sotalol 有什麼副作用？',
    '糖尿病有哪些藥物治療？',
  ])('fails closed to no FHIR for general medical knowledge: %s', (question) => {
    const fhirOnlyNames = names.filter((name) => name !== 'searchMedicalLiterature')

    expect(explicitlyReferencesPatient(question)).toBe(false)
    expect(implicitlyRequestsPatientRecord(question)).toBe(false)
    expect(selectAgentToolNames(question, fhirOnlyNames, 'general')).toEqual([])
  })

  it('still routes an implicit but unambiguous record lookup', () => {
    const question = '請查最近兩次 HbA1c 的數值與趨勢'

    expect(implicitlyRequestsPatientRecord(question)).toBe(true)
    expect(selectAgentToolNames(question, names, 'patient')).toContain('searchObservationByName')
  })

  it('recognizes an English personal pronoun without over-fetching a full snapshot', () => {
    const question = 'What is my latest HbA1c?'
    const selected = selectAgentToolNames(question, names, 'patient')

    expect(explicitlyReferencesPatient(question)).toBe(true)
    expect(selected).toContain('searchObservationByName')
    expect(selected).not.toContain('getHealthSummarySnapshot')
  })

  it('treats the explicit scope as the boundary for an ambiguous imaging question', () => {
    const question = '胸部 X 光有什麼問題嗎'
    const patientTools = selectAgentToolNames(question, names, 'patient')
    const generalTools = selectAgentToolNames(question, names, 'general')

    expect(patientTools).toEqual(['queryImagingRecords'])
    expect(forcedInitialAgentToolName(question, patientTools, 'patient'))
      .toBe('queryImagingRecords')
    expect(generalTools).toEqual([])
  })

  it('leaves the full tool decision to a frontier model in automatic scope', () => {
    const question = 'X光有什麼問題嗎'

    expect(selectAgentToolNames(question, names, 'auto')).toEqual(names)
    expect(forcedInitialAgentToolName(question, names, 'auto')).toBeUndefined()
  })

  it('prefetches only compact argument-free local tools', () => {
    expect(shouldPreExecuteLocalAgentTool('getDataOverview')).toBe(true)
    expect(shouldPreExecuteLocalAgentTool('getHealthSummarySnapshot')).toBe(true)
    expect(shouldPreExecuteLocalAgentTool('getActiveMedicationList')).toBe(true)
    expect(shouldPreExecuteLocalAgentTool('getRecentVisits')).toBe(true)
    expect(shouldPreExecuteLocalAgentTool('queryImagingRecords')).toBe(true)
    expect(shouldPreExecuteLocalAgentTool('searchObservationByName')).toBe(false)
    expect(shouldPreExecuteLocalAgentTool(undefined)).toBe(false)
  })
})
