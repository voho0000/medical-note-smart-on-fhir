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

        // Handle queryPatientInfo (returns patient demographics, not count-based)
        if (tr.toolName === 'queryPatientInfo') {
          if (r?.success && r?.data) {
            return `${tr.toolName} ${translations.queryResult}:\n${JSON.stringify(r.data, null, 2)}`
          } else {
            return `${tr.toolName} ${translations.queryFailed}: ${r?.summary || translations.noData}`
          }
        }

        // Handle FHIR tool results (with count field)
        const countInfo =
          r?.count === 0
            ? translations.noDataFound.replace('{summary}', r?.summary || '')
            : translations.foundRecords.replace('{count}', String(r?.count || 0))
        return `${tr.toolName} ${translations.queryResult}: ${
          r?.success ? countInfo : translations.queryFailed
        }\n${r?.count > 0 ? JSON.stringify(r?.data?.slice(0, 10) || [], null, 2) : translations.noData}`
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
