/**
 * Build Agent System Prompt Use Case
 * Constructs enhanced system prompt for agent mode with clinical context and tool descriptions
 */

export interface BuildAgentSystemPromptInput {
  baseSystemPrompt: string
  clinicalContext: string
  patientId?: string
  hasPerplexityKey: boolean
  translations: {
    deepModeIntro: string
    currentPatient: string
    patientId: string
    hasPermission: string
    organizedClinicalData: string
    organizedClinicalDataDesc: string
    availableTools: string
    availableToolsPrefix: string
    availableToolsSuffix: string
    toolDescriptions: {
      queryPatientInfo: string
      queryConditions: string
      queryMedications: string
      queryAllergies: string
      queryDiagnosticReports: string
      queryObservations: string
      queryProcedures: string
      queryEncounters: string
      searchMedicalLiterature: string
    }
    importantNote: string
    usageGuidelines: string
    prioritizeClinicalData: string
    useToolsWhenNeeded: string
    useToolsDirectly: string
    noAuthNeeded: string
    mustExplainResults: string
    provideAnalysis: string
    indicateNoRecords: string
    helpWithClinicalData: string
    helpWithTools: string
  }
}

export class BuildAgentSystemPromptUseCase {
  execute(input: BuildAgentSystemPromptInput): string {
    const { baseSystemPrompt, clinicalContext, patientId, hasPerplexityKey, translations: t } = input

    const hasClinicalData = clinicalContext.trim().length > 0
    const hasPatientId = !!patientId

    // Build patient context section
    const patientSection = hasPatientId
      ? `**${t.currentPatient}**
- ${t.patientId.replace('{id}', patientId)}
- ${t.hasPermission}`
      : `**${t.currentPatient}**
- No patient context available
- FHIR query tools will not work without patient ID`

    // Build clinical data section (only if available)
    const clinicalDataSection = hasClinicalData
      ? `**${t.organizedClinicalData}**
${t.organizedClinicalDataDesc}

${clinicalContext}

---`
      : ''

    // Build tools list
    const toolsList = `1. queryPatientInfo - ${t.toolDescriptions.queryPatientInfo}
2. queryConditions - ${t.toolDescriptions.queryConditions}
3. queryMedications - ${t.toolDescriptions.queryMedications}
4. queryAllergies - ${t.toolDescriptions.queryAllergies}
5. queryDiagnosticReports - ${t.toolDescriptions.queryDiagnosticReports}
6. queryObservations - ${t.toolDescriptions.queryObservations}
7. queryProcedures - ${t.toolDescriptions.queryProcedures}
8. queryEncounters - ${t.toolDescriptions.queryEncounters}${
      hasPerplexityKey ? `
9. searchMedicalLiterature - ${t.toolDescriptions.searchMedicalLiterature}` : ''
    }`

    // Build usage guidelines
    const usageGuidelines = hasClinicalData
      ? `- ${t.prioritizeClinicalData}
- ${t.useToolsWhenNeeded}`
      : `- ${t.useToolsDirectly}`

    // Compose final prompt
    return `${baseSystemPrompt}

${t.deepModeIntro}

${patientSection}

${clinicalDataSection}

**${t.availableTools}**
${hasClinicalData ? t.availableToolsPrefix : ''}${t.availableToolsSuffix}

${toolsList}

${t.importantNote}

**${t.usageGuidelines}**
${usageGuidelines}
- ${t.noAuthNeeded}
- ${t.mustExplainResults}
- ${t.provideAnalysis}
- ${t.indicateNoRecords}

${hasClinicalData ? t.helpWithClinicalData : t.helpWithTools}`
  }
}

export const buildAgentSystemPromptUseCase = new BuildAgentSystemPromptUseCase()
