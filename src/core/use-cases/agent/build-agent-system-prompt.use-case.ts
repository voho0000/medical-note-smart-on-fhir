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
  /** Exact schemas exposed on this turn. Omit for the legacy/full tool list. */
  availableToolNames?: readonly string[]
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
      queryLabResultsByCategory: string
      queryImagingRecords: string
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
    groundingSelfCheck: string
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
    const available = input.availableToolNames ? new Set(input.availableToolNames) : null
    const toolLine = (name: keyof typeof t.toolDescriptions) =>
      available && !available.has(name) ? null : `- ${name} — ${t.toolDescriptions[name]}`
    const toolSection = (heading: string, names: Array<keyof typeof t.toolDescriptions>) => {
      const lines = names.map(toolLine).filter((line): line is string => Boolean(line))
      return lines.length > 0 ? `**${heading}**\n${lines.join('\n')}` : null
    }
    const toolsList = [
      toolSection('Patient & Overview', ['queryPatientInfo', 'getDataOverview']),
      toolSection('Visits', ['queryEncounters', 'getRecentVisits', 'getEncounterDetails', 'listEncounterDepartments']),
      toolSection('Diagnoses & Conditions', ['queryConditions']),
      toolSection('Reports / Labs / Imaging / Procedures', [
        'queryDiagnosticReports',
        'queryLabResultsByCategory',
        'queryImagingRecords',
        'queryObservations',
        'searchObservationByName',
        'listAvailableObservationCodes',
        'queryProcedures',
      ]),
      toolSection('Medications & Allergies', [
        'queryMedications',
        'getActiveMedicationList',
        'queryAllergies',
        'queryImmunizations',
      ]),
      hasPerplexityKey ? toolSection('Literature', ['searchMedicalLiterature']) : null,
    ].filter((section): section is string => Boolean(section)).join('\n\n')

    // Build usage guidelines
    const usageGuidelines = hasClinicalData
      ? `- ${t.prioritizeClinicalData}
- ${t.useToolsWhenNeeded}`
      : `- ${t.useToolsDirectly}`

    const safetyContract = `# NON-NEGOTIABLE CLINICAL OUTPUT CONTRACT
These rules override every later style instruction. An answer that violates any rule is invalid and must be rewritten before returning.
1. Write only Taiwanese Traditional Chinese (zh-TW). Never use Simplified Chinese or Mainland-China medical wording. For example, write「突變、四環素、腸、門」, never「突变、四环素、肠、门」.
2. Copy medication names, dose text, and frequency exactly from tool output. Do not translate, expand, normalize, or guess them. Unless the user explicitly asks for a drug explanation, list only the medication fields returned by tools and omit any ingredient / purpose / drug-class column.
3. Never infer a medication ingredient, drug class, indication, formulation, or treatment target from a brand name. If the tool did not provide a field, write「資料未提供」.
4. For laboratory results, use only tool-provided normalityStatus and referenceRange. Never add customary ranges, diagnose conditions such as anemia, infer a cause, or call an unassessed value stable/normal. If normalityStatus is "Not provided", write「資料未提供正常／異常判定」.
5. Every diagnosis, medication, laboratory value, status, range, and date must be grounded in tool output. Do not recommend treatment changes. Ask the user to discuss clinically important findings with their physician.
Before returning, scan the complete answer once for unsupported medication explanations, invented ranges or diagnoses, internal contradictions, and Simplified Chinese; rewrite any violation.`

    // Put the safety contract first because smaller local models obey early,
    // concise constraints more reliably than rules appended after long schemas.
    const finalPrompt = `${safetyContract}

${baseSystemPrompt}

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
- TOOL EXECUTION CONTRACT: use the fewest relevant tools. Never invent a date range or filter the user did not request; omit optional filters by default. If a self-chosen filter returns zero records, retry without that filter before concluding absence. Stop calling tools once the requested facts are available. In the final answer, include the exact requested dates and values, but do not expose internal resource identifiers.
- ${t.noAuthNeeded}
- ${t.mustExplainResults}
- ${t.provideAnalysis}
- ${t.indicateNoRecords}
${hasPerplexityKey ? `\n${t.literatureKeywords}` : ''}

${hasClinicalData ? t.helpWithClinicalData : t.helpWithTools}

${t.groundingSelfCheck}`

    return finalPrompt
  }
}

export const buildAgentSystemPromptUseCase = new BuildAgentSystemPromptUseCase()
