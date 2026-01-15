/**
 * Agent Tool Names Constants
 * Single Source of Truth for tool display names
 */

export const AGENT_TOOL_DISPLAY_NAMES: Record<string, string> = {
  queryConditions: '查詢診斷資料',
  queryMedications: '查詢用藥資料',
  queryAllergies: '查詢過敏史',
  queryObservations: '查詢檢驗數據',
  queryDiagnosticReports: '查詢檢驗報告',
  queryProcedures: '查詢處置紀錄',
  queryEncounters: '查詢就診紀錄',
  searchMedicalLiterature: '搜尋醫學文獻',
} as const

export type AgentToolName = keyof typeof AGENT_TOOL_DISPLAY_NAMES

export function getToolDisplayName(toolName: string): string {
  return AGENT_TOOL_DISPLAY_NAMES[toolName as AgentToolName] || toolName
}
