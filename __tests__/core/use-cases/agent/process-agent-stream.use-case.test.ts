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

    it('should handle Chinese sources header', () => {
      const input: ProcessCitationsInput = {
        content: 'Content [1]\n\n**參考來源**\nAlready here',
        citations: ['https://example.com']
      }

      const result = useCase.processCitations(input)

      const sourcesCount = (result.processedContent.match(/\*\*Sources:\*\*/g) || []).length
      expect(sourcesCount).toBe(0)
    })

    it('should handle empty citations', () => {
      const input: ProcessCitationsInput = {
        content: 'Content without citations',
        citations: []
      }

      const result = useCase.processCitations(input)

      expect(result.processedContent).toContain('Content without citations')
      expect(result.processedContent).toContain('**Sources:**')
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
