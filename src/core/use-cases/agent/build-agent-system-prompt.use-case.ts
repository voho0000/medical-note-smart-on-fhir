/**
 * Build Agent System Prompt Use Case
 * Constructs enhanced system prompt for agent mode with clinical context and tool descriptions
 */

export interface BuildAgentSystemPromptInput {
  baseSystemPrompt: string
  clinicalContext: string
  patientId?: string
  /** 'local' = querying an in-memory uploaded FHIR bundle; 'live' (default) = SMART server */
  mode?: 'live' | 'local'
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
      queryImmunizations: string
      searchMedicalLiterature: string
    }
    importantNote: string
    icdCodeCaveat: string
    usageGuidelines: string
    prioritizeClinicalData: string
    useToolsWhenNeeded: string
    useToolsDirectly: string
    noAuthNeeded: string
    mustExplainResults: string
    provideAnalysis: string
    indicateNoRecords: string
    literatureKeywords: string
    helpWithClinicalData: string
    helpWithTools: string
  }
}

export class BuildAgentSystemPromptUseCase {
  execute(input: BuildAgentSystemPromptInput): string {
    const { baseSystemPrompt, clinicalContext, patientId, mode = 'live', hasPerplexityKey, translations: t } = input

    const hasClinicalData = clinicalContext.trim().length > 0
    const hasPatientId = !!patientId
    const isLocalMode = mode === 'local'

    // Build patient context section. In local-bundle mode the patient ID is
    // implicit (single patient per bundle), so the warning about needing one
    // is misleading — swap it for a local-mode notice.
    const patientSection = hasPatientId
      ? `**${t.currentPatient}**
- ${t.patientId.replace('{id}', patientId)}
- ${t.hasPermission}`
      : isLocalMode
        ? `**${t.currentPatient}**
- Reading from locally-imported FHIR bundle — patient ID is implicit.
- FHIR query tools operate on the in-memory bundle, not a live server.`
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
8. queryEncounters - ${t.toolDescriptions.queryEncounters}
9. queryImmunizations - ${t.toolDescriptions.queryImmunizations}${
      hasPerplexityKey ? `
10. searchMedicalLiterature - ${t.toolDescriptions.searchMedicalLiterature}` : ''
    }`

    // Build usage guidelines
    const usageGuidelines = hasClinicalData
      ? `- ${t.prioritizeClinicalData}
- ${t.useToolsWhenNeeded}`
      : `- ${t.useToolsDirectly}`

    // Compose final prompt
    const finalPrompt = `${baseSystemPrompt}

${t.deepModeIntro}

${patientSection}

${clinicalDataSection}

**${t.availableTools}**
${hasClinicalData ? t.availableToolsPrefix : ''}${t.availableToolsSuffix}

${toolsList}

${t.importantNote}

${t.icdCodeCaveat}

**${t.usageGuidelines}**
${usageGuidelines}
- ${t.noAuthNeeded}
- ${t.mustExplainResults}
- ${t.provideAnalysis}
- ${t.indicateNoRecords}
${hasPerplexityKey ? `\n${t.literatureKeywords}` : ''}

${hasClinicalData ? t.helpWithClinicalData : t.helpWithTools}`
    
    return finalPrompt
  }
}

export const buildAgentSystemPromptUseCase = new BuildAgentSystemPromptUseCase()
