import { ProcessAgentStreamUseCase } from '@/src/core/use-cases/agent/process-agent-stream.use-case'
import type { ProcessCitationsInput } from '@/src/core/use-cases/agent/process-agent-stream.use-case'

describe('ProcessAgentStreamUseCase', () => {
  let useCase: ProcessAgentStreamUseCase

  beforeEach(() => {
    useCase = new ProcessAgentStreamUseCase()
  })

  describe('processCitations', () => {
    it('should convert citation numbers to markdown links', () => {
      const input: ProcessCitationsInput = {
        content: 'This is a fact [1] and another fact [2].',
        citations: ['https://example.com/1', 'https://example.com/2']
      }

      const result = useCase.processCitations(input)

      expect(result.processedContent).toContain('[[1]](https://example.com/1)')
      expect(result.processedContent).toContain('[[2]](https://example.com/2)')
    })

    it('should add sources list at the bottom', () => {
      const input: ProcessCitationsInput = {
        content: 'Content with citation [1]',
        citations: ['https://example.com/1']
      }

      const result = useCase.processCitations(input)

      expect(result.processedContent).toContain('**Sources:**')
      expect(result.processedContent).toContain('1. [https://example.com/1](https://example.com/1)')
    })

    it('should handle multiple citations', () => {
      const input: ProcessCitationsInput = {
        content: 'Fact [1], another [2], and [3]',
        citations: ['https://a.com', 'https://b.com', 'https://c.com']
      }

      const result = useCase.processCitations(input)

      expect(result.processedContent).toContain('[[1]](https://a.com)')
      expect(result.processedContent).toContain('[[2]](https://b.com)')
      expect(result.processedContent).toContain('[[3]](https://c.com)')
    })

    it('should not add sources list if already present', () => {
      const input: ProcessCitationsInput = {
        content: 'Content [1]\n\n**Sources:**\nAlready here',
        citations: ['https://example.com']
      }

      const result = useCase.processCitations(input)

      const sourcesCount = (result.processedContent.match(/\*\*Sources:\*\*/g) || []).length
      expect(sourcesCount).toBe(1)
    })

    it('strips an existing Chinese 參考來源 block and replaces with English Sources', () => {
      // Policy: regardless of which language the AI emitted the source
      // header in, the canonical SMART app rendering uses English
      // "**Sources:**". Strip the old header (zh or en) and re-emit our
      // own when citations are present.
      const input: ProcessCitationsInput = {
        content: 'Content [1]\n\n**參考來源**\nAlready here',
        citations: ['https://example.com'],
      }
      const result = useCase.processCitations(input)
      expect(result.processedContent).not.toContain('參考來源')
      expect(result.processedContent).toContain('**Sources:**')
    })

    it('does NOT append Sources section when citations array is empty', () => {
      // Previously the use-case always added "**Sources:**" even with
      // zero citations, leaving a dangling section header. Behaviour
      // updated: skip the section entirely when there's nothing to cite.
      const input: ProcessCitationsInput = {
        content: 'Content without citations',
        citations: [],
      }
      const result = useCase.processCitations(input)
      expect(result.processedContent).toContain('Content without citations')
      expect(result.processedContent).not.toContain('**Sources:**')
    })

    it('should handle content without citation numbers', () => {
      const input: ProcessCitationsInput = {
        content: 'Content without numbers',
        citations: ['https://example.com']
      }

      const result = useCase.processCitations(input)

      expect(result.processedContent).toContain('Content without numbers')
      expect(result.processedContent).toContain('**Sources:**')
    })
  })

  describe('buildToolResultsSummary', () => {
    const mockTranslations = {
      queryResult: 'Query Result',
      queryFailed: 'Query Failed',
      noData: 'No data',
      noDataFound: 'No data found: {summary}',
      foundRecords: 'Found {count} records'
    }

    it('should build summary for successful FHIR query', () => {
      const toolResults = [
        {
          toolName: 'queryConditions',
          result: {
            success: true,
            count: 5,
            data: [{ id: '1' }, { id: '2' }],
            summary: 'Conditions found'
          }
        }
      ]

      const result = useCase.buildToolResultsSummary(toolResults, mockTranslations)

      expect(result.summary).toContain('queryConditions Query Result')
      expect(result.summary).toContain('Found 5 records')
    })

    it('should handle failed FHIR query', () => {
      const toolResults = [
        {
          toolName: 'queryMedications',
          result: {
            success: false
          }
        }
      ]

      const result = useCase.buildToolResultsSummary(toolResults, mockTranslations)

      expect(result.summary).toContain('Query Failed')
    })

    it('should handle literature search results', () => {
      const toolResults = [
        {
          toolName: 'searchMedicalLiterature',
          result: {
            success: true,
            content: 'Literature content',
            citations: ['https://pubmed.com/1', 'https://pubmed.com/2']
          }
        }
      ]

      const result = useCase.buildToolResultsSummary(toolResults, mockTranslations)

      expect(result.summary).toContain('searchMedicalLiterature Query Result')
      expect(result.summary).toContain('Literature content')
      expect(result.citations).toEqual(['https://pubmed.com/1', 'https://pubmed.com/2'])
    })

    it('should handle failed literature search', () => {
      const toolResults = [
        {
          toolName: 'searchMedicalLiterature',
          result: {
            success: false,
            content: 'Search failed'
          }
        }
      ]

      const result = useCase.buildToolResultsSummary(toolResults, mockTranslations)

      expect(result.summary).toContain('Query Failed')
      expect(result.summary).toContain('Search failed')
    })

    it('should handle zero count FHIR results', () => {
      const toolResults = [
        {
          toolName: 'queryAllergies',
          result: {
            success: true,
            count: 0,
            summary: 'No allergies'
          }
        }
      ]

      const result = useCase.buildToolResultsSummary(toolResults, mockTranslations)

      expect(result.summary).toContain('No data found: No allergies')
    })

    it('preserves every domain in a compact health snapshot', () => {
      const result = useCase.buildToolResultsSummary([{
        toolName: 'getHealthSummarySnapshot',
        result: {
          success: true,
          counts: { conditions: 1, activeMedications: 1, abnormalLabs: 1, recentVitals: 1 },
          truncated: { conditions: false, activeMedications: false, abnormalLabs: false, recentVitals: false },
          groundingRules: { instruction: 'Use only these records.' },
          data: {
            conditions: [{ name: 'Hypertension' }],
            medications: [{ name: 'Sotalol' }],
            abnormalLabs: [{ name: 'HbA1c', value: 8.2 }],
            recentVitals: [{ name: 'Body Height', value: 168 }],
          },
        },
      }], mockTranslations)

      expect(result.summary).toContain('getHealthSummarySnapshot Query Result')
      expect(result.summary).toContain('Hypertension')
      expect(result.summary).toContain('Sotalol')
      expect(result.summary).toContain('HbA1c')
      expect(result.summary).not.toContain('No data found')
    })

    it('warns that an incomplete FHIR query cannot establish absence', () => {
      const result = useCase.buildToolResultsSummary([{
        toolName: 'queryImagingRecords',
        result: {
          success: false,
          count: 0,
          incomplete: true,
          canConcludeAbsence: false,
          summary: 'ImagingStudy query unsupported',
          queryIssues: [{ resourceType: 'ImagingStudy', state: 'unsupported' }],
        },
      }], mockTranslations)

      expect(result.summary).toContain('MUST NOT be interpreted as clinical absence')
      expect(result.summary).toContain('ImagingStudy query unsupported')
    })

    it('warns when a successful result is truncated', () => {
      const result = useCase.buildToolResultsSummary([{
        toolName: 'queryDiagnosticReports',
        result: {
          success: true,
          count: 84,
          totalCount: 84,
          returnedCount: 10,
          truncated: true,
          hasMore: true,
          data: Array.from({ length: 10 }, (_, index) => ({ name: `Report ${index}` })),
        },
      }], mockTranslations)

      expect(result.summary).toContain('only 10 of 84 matching records were returned')
      expect(result.summary).toContain('Narrow the query')
    })

    it('preserves per-test query coverage for the follow-up answer', () => {
      const result = useCase.buildToolResultsSummary([{
        toolName: 'queryDiagnosticReports',
        result: {
          success: true,
          count: 2,
          requestedQueryTerms: ['CA125', 'CA199'],
          matchedQueryTerms: ['CA125', 'CA199'],
          unmatchedQueryTerms: [],
          data: [
            { reportName: 'CA-125' },
            { reportName: 'CA–199腫瘤標記' },
          ],
        },
      }], mockTranslations)

      expect(result.summary).toContain('QUERY-TERM COVERAGE')
      expect(result.summary).toContain('"matchedQueryTerms": [')
      expect(result.summary).toContain('"CA199"')
      expect(result.summary).toContain('CA–199腫瘤標記')
    })

    it('keeps positive records from a partially supported imaging query', () => {
      const result = useCase.buildToolResultsSummary([{
        toolName: 'queryImagingRecords',
        result: {
          success: true,
          count: 1,
          incomplete: true,
          canConcludeAbsence: false,
          data: [{ reportName: 'Chest CT' }],
          queryIssues: [{ resourceType: 'ImagingStudy', state: 'unsupported' }],
        },
      }], mockTranslations)

      expect(result.summary).toContain('Chest CT')
      expect(result.summary).toContain('positive records are valid')
      expect(result.summary).toContain('MUST NOT infer that any other record is absent')
    })

    it('warns when follow-up summarization itself omits returned rows', () => {
      const result = useCase.buildToolResultsSummary([{
        toolName: 'queryImagingRecords',
        result: {
          success: true,
          count: 12,
          totalCount: 12,
          returnedCount: 12,
          truncated: false,
          data: Array.from({ length: 12 }, (_, index) => ({ name: `Image ${index}` })),
        },
      }], mockTranslations)

      expect(result.summary).toContain('follow-up summary contains only 10 of the 12')
      expect(result.summary).toContain('Narrow the query')
    })

    it('keeps all compact analyte groups for a category query', () => {
      const result = useCase.buildToolResultsSummary([{
        toolName: 'queryLabResultsByCategory',
        result: {
          success: true,
          count: 12,
          totalCount: 12,
          returnedCount: 12,
          truncated: false,
          data: Array.from({ length: 12 }, (_, index) => ({
            analyte: `Tumor marker ${index + 1}`,
            results: [{ value: index + 1 }],
          })),
        },
      }], mockTranslations)

      expect(result.summary).toContain('Tumor marker 12')
      expect(result.summary).not.toContain('follow-up summary contains only')
    })

    it('should handle multiple tool results', () => {
      const toolResults = [
        {
          toolName: 'queryConditions',
          result: { success: true, count: 3, data: [] }
        },
        {
          toolName: 'searchMedicalLiterature',
          result: { success: true, content: 'Literature', citations: ['url'] }
        }
      ]

      const result = useCase.buildToolResultsSummary(toolResults, mockTranslations)

      expect(result.summary).toContain('queryConditions')
      expect(result.summary).toContain('searchMedicalLiterature')
      expect(result.citations).toEqual(['url'])
    })
  })
})
