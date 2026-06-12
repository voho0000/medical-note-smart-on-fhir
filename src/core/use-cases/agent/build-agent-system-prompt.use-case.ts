/**
 * Build Agent System Prompt Use Case
 * Constructs enhanced system prompt for agent mode with clinical context and tool descriptions
 */

export interface BuildAgentSystemPromptInput {
  baseSystemPrompt: string
  clinicalContext: string
  /**
   * Whether a patient context is loaded. The actual FHIR ID is deliberately
   * NOT included in the prompt — it would be sent to cloud LLM providers on
   * every turn, defeating the tool-layer PII scrubber. Tools resolve the
   * patient implicitly from the bound data source.
   */
  hasPatient?: boolean
  /** 'local' = querying an in-memory uploaded FHIR bundle; 'live' (default) = SMART server */
  mode?: 'live' | 'local'
  hasPerplexityKey: boolean
  translations: {
    deepModeIntro: string
    currentPatient: string
    hasPermission: string
    organizedClinicalData: string
    organizedClinicalDataDesc: string
    availableTools: string
    availableToolsPrefix: string
    availableToolsSuffix: string
    toolDescriptions: {
      queryPatientInfo: string
      getDataOverview: string
      queryEncounters: string
      getRecentVisits: string
      getEncounterDetails: string
      listEncounterDepartments: string
      queryConditions: string
      queryObservations: string
      queryDiagnosticReports: string
      searchObservationByName: string
      listAvailableObservationCodes: string
      queryProcedures: string
      queryMedications: string
      getActiveMedicationList: string
      queryAllergies: string
      queryImmunizations: string
      searchMedicalLiterature: string
    }
    importantNote: string
    icdCodeCaveat: string
    anonymizationNote: string
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
    const { baseSystemPrompt, clinicalContext, hasPatient, mode = 'live', hasPerplexityKey, translations: t } = input

    const hasClinicalData = clinicalContext.trim().length > 0
    const isLocalMode = mode === 'local'

    // Build patient context section. In local-bundle mode the patient ID is
    // implicit (single patient per bundle), so the warning about needing one
    // is misleading — swap it for a local-mode notice.
    const patientSection = hasPatient
      ? `**${t.currentPatient}**
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

    // Build tools list — grouped by clinical concern, matching the left-panel
    // tabs so the LLM picks the right tool for each kind of question.
    const toolsList = `**Patient & Overview**
- queryPatientInfo — ${t.toolDescriptions.queryPatientInfo}
- getDataOverview — ${t.toolDescriptions.getDataOverview}

**Visits**
- queryEncounters — ${t.toolDescriptions.queryEncounters}
- getRecentVisits — ${t.toolDescriptions.getRecentVisits}
- getEncounterDetails — ${t.toolDescriptions.getEncounterDetails}
- listEncounterDepartments — ${t.toolDescriptions.listEncounterDepartments}

**Diagnoses & Conditions**
- queryConditions — ${t.toolDescriptions.queryConditions}

**Reports / Labs / Imaging / Procedures**
- queryDiagnosticReports — ${t.toolDescriptions.queryDiagnosticReports}
- queryObservations — ${t.toolDescriptions.queryObservations}
- searchObservationByName — ${t.toolDescriptions.searchObservationByName}
- listAvailableObservationCodes — ${t.toolDescriptions.listAvailableObservationCodes}
- queryProcedures — ${t.toolDescriptions.queryProcedures}

**Medications & Allergies**
- queryMedications — ${t.toolDescriptions.queryMedications}
- getActiveMedicationList — ${t.toolDescriptions.getActiveMedicationList}
- queryAllergies — ${t.toolDescriptions.queryAllergies}
- queryImmunizations — ${t.toolDescriptions.queryImmunizations}${
      hasPerplexityKey ? `

**Literature**
- searchMedicalLiterature — ${t.toolDescriptions.searchMedicalLiterature}` : ''
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

${t.anonymizationNote}

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
