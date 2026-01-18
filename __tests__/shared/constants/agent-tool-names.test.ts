import { AGENT_TOOL_DISPLAY_NAMES, getToolDisplayName } from '@/src/shared/constants/agent-tool-names.constants'

describe('agent-tool-names.constants', () => {
  describe('AGENT_TOOL_DISPLAY_NAMES', () => {
    it('should have all tool names defined', () => {
      expect(AGENT_TOOL_DISPLAY_NAMES.queryConditions).toBe('查詢診斷資料')
      expect(AGENT_TOOL_DISPLAY_NAMES.queryMedications).toBe('查詢用藥資料')
      expect(AGENT_TOOL_DISPLAY_NAMES.queryAllergies).toBe('查詢過敏史')
      expect(AGENT_TOOL_DISPLAY_NAMES.queryObservations).toBe('查詢檢驗數據')
      expect(AGENT_TOOL_DISPLAY_NAMES.queryDiagnosticReports).toBe('查詢檢驗報告')
      expect(AGENT_TOOL_DISPLAY_NAMES.queryProcedures).toBe('查詢處置紀錄')
      expect(AGENT_TOOL_DISPLAY_NAMES.queryEncounters).toBe('查詢就診紀錄')
      expect(AGENT_TOOL_DISPLAY_NAMES.searchMedicalLiterature).toBe('搜尋醫學文獻')
    })

    it('should be a readonly object', () => {
      expect(Object.isFrozen(AGENT_TOOL_DISPLAY_NAMES)).toBe(false)
      expect(typeof AGENT_TOOL_DISPLAY_NAMES).toBe('object')
    })
  })

  describe('getToolDisplayName', () => {
    it('should return display name for valid tool', () => {
      expect(getToolDisplayName('queryConditions')).toBe('查詢診斷資料')
      expect(getToolDisplayName('queryMedications')).toBe('查詢用藥資料')
      expect(getToolDisplayName('queryAllergies')).toBe('查詢過敏史')
    })

    it('should return original name for unknown tool', () => {
      expect(getToolDisplayName('unknownTool')).toBe('unknownTool')
      expect(getToolDisplayName('randomName')).toBe('randomName')
    })

    it('should handle empty string', () => {
      expect(getToolDisplayName('')).toBe('')
    })
  })
})
