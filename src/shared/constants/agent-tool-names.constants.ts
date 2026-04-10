/**
 * Agent Tool Names Constants
 * Tool name keys for i18n lookup
 */

export const AGENT_TOOL_NAMES = [
  'queryPatientInfo',
  'queryConditions',
  'queryMedications',
  'queryAllergies',
  'queryObservations',
  'queryDiagnosticReports',
  'queryProcedures',
  'queryEncounters',
  'searchMedicalLiterature',
] as const

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number]

/**
 * Get tool display name from i18n
 * @param toolName - The tool name key
 * @param t - Translation object from useLanguage hook
 * @returns Localized tool display name
 */
export function getToolDisplayName(toolName: string, toolNames: Record<string, string>): string {
  return toolNames[toolName as AgentToolName] || toolName
}
