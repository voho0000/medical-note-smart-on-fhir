// Unit Tests: QueryAiUseCase
import { QueryAiUseCase } from '@/src/core/use-cases/ai/query-ai.use-case'
import type { IAiService } from '@/src/core/interfaces/services/ai.service.interface'
import type { AiQueryRequest, AiQueryResponse } from '@/src/core/entities/ai.entity'

describe('QueryAiUseCase', () => {
  let mockAiService: jest.Mocked<IAiService>
  let useCase: QueryAiUseCase

  beforeEach(() => {
    mockAiService = {
      query: jest.fn(),
      isAvailable: jest.fn(),
      getSupportedModels: jest.fn(),
    }
    useCase = new QueryAiUseCase(mockAiService)
  })

  describe('execute', () => {
    it('should throw error when service is not available', async () => {
      // Arrange
      mockAiService.isAvailable.mockReturnValue(false)
      const request: AiQueryRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 'gpt-4',
      }

      // Act & Assert
      await expect(useCase.execute(request)).rejects.toThrow(
        'AI service is not available. Please configure API key or proxy.'
      )
      expect(mockAiService.isAvailable).toHaveBeenCalledTimes(1)
      expect(mockAiService.query).not.toHaveBeenCalled()
    })

    it('should query AI service when available', async () => {
      // Arrange
      mockAiService.isAvailable.mockReturnValue(true)
      const request: AiQueryRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 'gpt-4',
      }
      const expectedResponse: AiQueryResponse = {
        text: 'Hi there!',
        metadata: {
          modelId: 'gpt-4',
          provider: 'openai',
          tokensUsed: 10,
        },
      }
      mockAiService.query.mockResolvedValue(expectedResponse)

      // Act
      const result = await useCase.execute(request)

      // Assert
      expect(result).toEqual(expectedResponse)
      expect(mockAiService.isAvailable).toHaveBeenCalledTimes(1)
      expect(mockAiService.query).toHaveBeenCalledWith(request)
    })

    it('should pass through service errors', async () => {
      // Arrange
      mockAiService.isAvailable.mockReturnValue(true)
      const request: AiQueryRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 'gpt-4',
      }
      const error = new Error('API rate limit exceeded')
      mockAiService.query.mockRejectedValue(error)

      // Act & Assert
      await expect(useCase.execute(request)).rejects.toThrow('API rate limit exceeded')
      expect(mockAiService.query).toHaveBeenCalledWith(request)
    })

    it('should handle requests with temperature and maxTokens', async () => {
      // Arrange
      mockAiService.isAvailable.mockReturnValue(true)
      const request: AiQueryRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 'gpt-4',
        temperature: 0.8,
        maxTokens: 1000,
      }
      const expectedResponse: AiQueryResponse = {
        text: 'Response',
        metadata: {
          modelId: 'gpt-4',
          provider: 'openai',
        },
      }
      mockAiService.query.mockResolvedValue(expectedResponse)

      // Act
      const result = await useCase.execute(request)

      // Assert
      expect(result).toEqual(expectedResponse)
      expect(mockAiService.query).toHaveBeenCalledWith(request)
    })
  })
})
