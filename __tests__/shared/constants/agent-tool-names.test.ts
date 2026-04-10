import { AGENT_TOOL_NAMES, getToolDisplayName } from '@/src/shared/constants/agent-tool-names.constants'

describe('agent-tool-names.constants', () => {
  describe('AGENT_TOOL_NAMES', () => {
    it('should have all tool names defined', () => {
      expect(AGENT_TOOL_NAMES).toContain('queryConditions')
      expect(AGENT_TOOL_NAMES).toContain('queryMedications')
      expect(AGENT_TOOL_NAMES).toContain('queryAllergies')
      expect(AGENT_TOOL_NAMES).toContain('queryObservations')
      expect(AGENT_TOOL_NAMES).toContain('queryDiagnosticReports')
      expect(AGENT_TOOL_NAMES).toContain('queryProcedures')
      expect(AGENT_TOOL_NAMES).toContain('queryEncounters')
      expect(AGENT_TOOL_NAMES).toContain('searchMedicalLiterature')
    })

    it('should be a readonly array', () => {
      expect(Array.isArray(AGENT_TOOL_NAMES)).toBe(true)
      expect(AGENT_TOOL_NAMES.length).toBeGreaterThan(0)
    })
  })

  describe('getToolDisplayName', () => {
    const mockToolNames = {
      queryConditions: '查詢診斷資料',
      queryMedications: '查詢用藥資料',
      queryAllergies: '查詢過敏史',
    }

    it('should return display name for valid tool', () => {
      expect(getToolDisplayName('queryConditions', mockToolNames)).toBe('查詢診斷資料')
      expect(getToolDisplayName('queryMedications', mockToolNames)).toBe('查詢用藥資料')
      expect(getToolDisplayName('queryAllergies', mockToolNames)).toBe('查詢過敏史')
    })

    it('should return original name for unknown tool', () => {
      expect(getToolDisplayName('unknownTool', mockToolNames)).toBe('unknownTool')
      expect(getToolDisplayName('randomName', mockToolNames)).toBe('randomName')
    })

    it('should handle empty string', () => {
      expect(getToolDisplayName('', mockToolNames)).toBe('')
    })
  })
})
