import {
  forcedInitialAgentToolName,
  selectAgentToolNames,
  selectAgentToolsForQuestion,
} from '@/src/infrastructure/ai/tools/agent-tool-router'

const names = [
  'queryPatientInfo',
  'getDataOverview',
  'queryEncounters',
  'getRecentVisits',
  'getEncounterDetails',
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
]

describe('agent tool router', () => {
  it('routes a lab trend question to lab tools only', () => {
    const selected = selectAgentToolNames('請查最近兩次 HbA1c 的數值與趨勢', names)
    expect(selected).toContain('searchObservationByName')
    expect(selected).toContain('queryDiagnosticReports')
    expect(selected).not.toContain('queryProcedures')
    expect(selected).not.toContain('queryAllergies')
  })

  it('combines encounter and lab groups for an inpatient lab question', () => {
    const selected = selectAgentToolNames('住院期間有哪些檢驗結果？', names)
    expect(selected).toContain('queryEncounters')
    expect(selected).toContain('getEncounterDetails')
    expect(selected).toContain('queryDiagnosticReports')
    expect(selected).not.toContain('queryImmunizations')
  })

  it('removes tools when the user explicitly says not to query records', () => {
    expect(selectAgentToolNames('不要查詢病歷，請解釋 HbA1c', names)).toEqual([])
  })

  it('fails open to every available tool for an unknown broad question', () => {
    expect(selectAgentToolNames('請協助分析目前狀況', names)).toEqual(names)
  })

  it('returns the routed tool object without changing tool values', () => {
    const tools = Object.fromEntries(names.map((name) => [name, { name }]))
    const selected = selectAgentToolsForQuestion(tools, '是否有 Penicillin 過敏？')
    expect(Object.keys(selected ?? {})).toEqual(['queryAllergies'])
    expect(selected?.queryAllergies).toBe(tools.queryAllergies)
  })

  it('forces an unambiguous patient-data lookup but not a general explanation', () => {
    expect(forcedInitialAgentToolName('請查這位病人的性別與年齡', ['queryPatientInfo']))
      .toBe('queryPatientInfo')
    expect(forcedInitialAgentToolName('請解釋性別欄位的意思', ['queryPatientInfo']))
      .toBeUndefined()
    expect(forcedInitialAgentToolName('不要查詢病歷，請解釋過敏', ['queryAllergies']))
      .toBeUndefined()
  })

  it('forces a grounding tool for a broad multi-domain patient summary', () => {
    expect(forcedInitialAgentToolName(
      '請用我匯入的健康資料整理慢性疾病、目前用藥與檢驗摘要',
      ['queryConditions', 'queryLabResultsByCategory', 'getActiveMedicationList'],
    )).toBe('queryConditions')
  })
})
