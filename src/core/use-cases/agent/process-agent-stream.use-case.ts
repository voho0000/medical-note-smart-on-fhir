/**
 * Process Agent Stream Use Case
 * Handles citation processing for literature search results
 */

export interface ProcessCitationsInput {
  content: string
  citations: string[]
}

export interface ProcessCitationsOutput {
  processedContent: string
}

export class ProcessAgentStreamUseCase {
  /**
   * Process literature citations in AI response
   * Converts citation numbers [1][2] to clickable markdown links
   */
  processCitations(input: ProcessCitationsInput): ProcessCitationsOutput {
    const { content, citations } = input
    let processedContent = content

    // Replace citation numbers like [1] with clickable markdown links
    // Only replace standalone [N] that are NOT already part of a link [N](url)
    // This prevents double-processing and messy output
    citations.forEach((citation, index) => {
      const citationNum = index + 1
      // Negative lookahead to avoid replacing [N] that's already followed by (url)
      const regex = new RegExp(`\\[${citationNum}\\](?!\\()`, 'g')
      // Keep the brackets in the link text for clarity: [1](url) displays as "[1]"
      const replacement = `[[${citationNum}]](${citation})`
      processedContent = processedContent.replace(regex, replacement)
    })

    // Always add sources list at the bottom for easy reference
    // Remove any existing sources section first to avoid duplication
    processedContent = processedContent.replace(/\n\n\*\*Sources:\*\*[\s\S]*$/, '')
    processedContent = processedContent.replace(/\n\n\*\*參考來源\*\*[\s\S]*$/, '')
    
    if (citations.length > 0) {
      processedContent += '\n\n**Sources:**\n' + citations.map((c, i) => `${i + 1}. [${c}](${c})`).join('\n')
    }

    return { processedContent }
  }

  /**
   * Build tool results summary for follow-up request
   */
  buildToolResultsSummary(
    toolResults: Array<{ toolName: string; result: unknown }>,
    translations: {
      queryResult: string
      queryFailed: string
      noData: string
      noDataFound: string
      foundRecords: string
    }
  ): { summary: string; citations: string[] } {
    const literatureCitations: string[] = []

    const summary = toolResults
      .map((tr) => {
        const r = tr.result as any

        // Handle literature search results differently from FHIR results
        if (tr.toolName === 'searchMedicalLiterature') {
          if (r?.success && r?.content) {
            // Store citations for post-processing AI response
            if (r?.citations && Array.isArray(r.citations)) {
              literatureCitations.push(...r.citations)
            }
            return `${tr.toolName} ${translations.queryResult}:\n${r.content}`
          } else {
            return `${tr.toolName} ${translations.queryFailed}: ${r?.content || translations.noData}`
          }
        }

        // These metadata tools return an object rather than a count-based list.
        if (tr.toolName === 'queryPatientInfo' || tr.toolName === 'getDataOverview') {
          if (r?.success && r?.data) {
            const warning = r?.incomplete || r?.canConcludeAbsence === false
              ? '\nIMPORTANT: this inventory is incomplete and MUST NOT be used to conclude that a resource is absent.'
              : ''
            return `${tr.toolName} ${translations.queryResult}:${warning}\n${JSON.stringify(r.data, null, 2)}`
          } else {
            return `${tr.toolName} ${translations.queryFailed}: ${r?.summary || translations.noData}`
          }
        }

        // Handle FHIR tool results (with count field)
        const hasPositiveRecords = Number(r?.count ?? 0) > 0
        if (
          !r?.success
          || (
            !hasPositiveRecords
            && (r?.incomplete === true || r?.canConcludeAbsence === false)
          )
        ) {
          return `${tr.toolName} ${translations.queryFailed}: ${
            r?.summary || translations.noData
          }\nIMPORTANT: this result is incomplete and MUST NOT be interpreted as clinical absence.\n${
            r?.queryIssues ? JSON.stringify(r.queryIssues, null, 2) : ''
          }`
        }
        const countInfo =
          r?.count === 0
            ? translations.noDataFound.replace('{summary}', r?.summary || '')
            : translations.foundRecords.replace('{count}', String(r?.count || 0))
        const truncationWarning = r?.truncated || r?.hasMore
          ? `\nIMPORTANT: only ${r?.returnedCount ?? r?.data?.length ?? 0} of ${r?.totalCount ?? r?.count ?? 0} matching records were returned. Narrow the query before concluding a specific record is absent.`
          : ''
        const summaryData = Array.isArray(r?.data) ? r.data.slice(0, 10) : []
        const summaryCapWarning = Array.isArray(r?.data) && r.data.length > summaryData.length
          ? `\nIMPORTANT: the follow-up summary contains only ${summaryData.length} of the ${r.data.length} records returned by the tool. Narrow the query before concluding a specific record is absent.`
          : ''
        const completenessWarning =
          r?.incomplete === true || r?.canConcludeAbsence === false
            ? '\nIMPORTANT: the returned positive records are valid, but one or more related resource queries were incomplete. You may report what was found, but MUST NOT infer that any other record is absent.'
            : ''
        return `${tr.toolName} ${translations.queryResult}: ${
          r?.success ? countInfo : translations.queryFailed
        }${truncationWarning}${summaryCapWarning}${completenessWarning}\n${r?.count > 0 ? JSON.stringify(summaryData, null, 2) : translations.noData}`
      })
      .join('\n\n')

    return { summary, citations: literatureCitations }
  }

  /**
   * Build follow-up messages for tool results
   */
  buildFollowUpMessages(
    originalMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    toolResultsSummary: string,
    originalQuestion: string,
    translations: {
      queriedFhirData: string
      answerQuestion: string
    }
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const assistantMsg = `${translations.queriedFhirData}\n\n${toolResultsSummary}`
    const userMsg = translations.answerQuestion.replace('{question}', originalQuestion)

    return [
      ...originalMessages,
      { role: 'assistant' as const, content: assistantMsg },
      { role: 'user' as const, content: userMsg },
    ]
  }
}

export const processAgentStreamUseCase = new ProcessAgentStreamUseCase()
