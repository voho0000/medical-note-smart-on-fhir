// Unit Tests: Gemini Service
import { GeminiService } from '@/src/infrastructure/ai/services/gemini.service'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import type { AiQueryRequest } from '@/src/core/entities/ai.entity'

// Mock the env config so the proxy path can be exercised deterministically.
// Default values mirror the test runtime (no proxy), keeping the keyed/direct
// tests below unchanged; the proxy describe mutates them per-test.
jest.mock('@/src/shared/config/env.config', () => ({
  ENV_CONFIG: { geminiProxyUrl: '', hasGeminiProxy: false, proxyClientKey: '' },
}))

const mutableEnv = ENV_CONFIG as unknown as {
  geminiProxyUrl: string
  hasGeminiProxy: boolean
  proxyClientKey: string
}

// Mock fetch
global.fetch = jest.fn()

describe('GeminiService', () => {
  let service: GeminiService
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    jest.clearAllMocks()
    service = new GeminiService('test-api-key')
  })

  describe('isAvailable', () => {
    it('should return true when API key is set', () => {
      const service = new GeminiService('test-key')
      expect(service.isAvailable()).toBe(true)
    })

    it('should return false when API key is not set and no proxy', () => {
      const service = new GeminiService(null)
      expect(service.isAvailable()).toBe(false)
    })
  })

  describe('setApiKey', () => {
    it('should update API key', () => {
      const service = new GeminiService(null)
      expect(service.isAvailable()).toBe(false)
      
      service.setApiKey('new-key')
      expect(service.isAvailable()).toBe(true)
    })
  })

  describe('query', () => {
    const mockRequest: AiQueryRequest = {
      modelId: 'gemini-3.1-flash-lite',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      temperature: 0.7,
    }

    it('should successfully query Gemini API', async () => {
      // Arrange
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Hello! How can I assist you?' }
              ]
            }
          }
        ],
        usageMetadata: {
          totalTokenCount: 25
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      // Act
      const result = await service.query(mockRequest)

      // Assert
      expect(result.text).toBe('Hello! How can I assist you?')
      expect(result.metadata.modelId).toBe('gemini-3.1-flash-lite')
      expect(result.metadata.provider).toBe('gemini')
      expect(result.metadata.tokensUsed).toBe(25)
    })

    it('should forward caller cancellation to the non-streaming request', async () => {
      mockFetch.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal
        signal.addEventListener('abort', () => {
          const error = new Error('The operation was aborted')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      }))
      const controller = new AbortController()
      const pending = service.query({ ...mockRequest, signal: controller.signal })

      controller.abort()

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('should throw error when API key is missing', async () => {
      // Arrange
      const service = new GeminiService(null)
      
      // Act & Assert
      await expect(service.query(mockRequest)).rejects.toThrow('Gemini API key or proxy is required')
    })

    it('should handle API errors', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'Invalid API key' } }),
      } as Response)

      // Act & Assert
      await expect(service.query(mockRequest)).rejects.toThrow('Invalid API key')
    })

    it('should include temperature in request', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
        }),
      } as Response)

      // Act
      await service.query(mockRequest)

      // Assert
      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1]?.body as string)
      expect(body.temperature).toBe(0.7)
    })

    it('should set generationConfig.responseMimeType when responseFormat is json', async () => {
      // Arrange
      const jsonRequest: AiQueryRequest = {
        modelId: 'gemini-3.1-flash-lite',
        messages: [{ role: 'user', content: 'Test' }],
        responseFormat: 'json',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
        }),
      } as Response)

      // Act
      await service.query(jsonRequest)

      // Assert
      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1]?.body as string)
      expect(body.generationConfig?.responseMimeType).toBe('application/json')
    })

    it('should NOT set generationConfig when responseFormat is absent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
        }),
      } as Response)

      await service.query(mockRequest)

      const fetchCall = mockFetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1]?.body as string)
      expect(body.generationConfig).toBeUndefined()
    })

    it('should include API key in headers for direct API', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
        }),
      } as Response)

      // Act
      await service.query(mockRequest)

      // Assert
      const fetchCall = mockFetch.mock.calls[0]
      const headers = fetchCall[1]?.headers as Record<string, string>
      expect(headers['x-goog-api-key']).toBe('test-api-key')
    })

    it('should handle empty response content', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '' }] } }],
        }),
      } as Response)

      // Act
      const result = await service.query(mockRequest)

      // Assert
      expect(result.text).toBe('')
    })

    it('should handle timeout', async () => {
      // Arrange
      mockFetch.mockImplementationOnce(() =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100)
        })
      )

      // Act & Assert
      await expect(service.query(mockRequest)).rejects.toThrow()
    })
  })

  // Regression guard for the GitHub Pages 405: the non-streaming proxy path must
  // target the ABSOLUTE Firebase proxy URL (NEXT_PUBLIC_GEMINI_URL), like the
  // streaming adapter and provider factory — never the relative
  // `/api/gemini-proxy`, which has no backend on the static deployment.
  describe('query via proxy (no API key — static deployment)', () => {
    const proxyRequest: AiQueryRequest = {
      modelId: 'gemini-3.1-flash-lite',
      messages: [{ role: 'user', content: 'Hello' }],
    }

    beforeEach(() => {
      jest.clearAllMocks()
      mutableEnv.geminiProxyUrl = 'https://proxy.example.com/gemini'
      mutableEnv.hasGeminiProxy = true
      mutableEnv.proxyClientKey = 'client-key'
    })

    afterEach(() => {
      mutableEnv.geminiProxyUrl = ''
      mutableEnv.hasGeminiProxy = false
      mutableEnv.proxyClientKey = ''
    })

    it('targets the absolute geminiProxyUrl, not the relative /api/gemini-proxy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'hi' }),
      } as Response)

      const proxyService = new GeminiService(null)
      const result = await proxyService.query(proxyRequest)

      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toBe('https://proxy.example.com/gemini')
      expect(fetchUrl).not.toBe('/api/gemini-proxy')

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['x-proxy-key']).toBe('client-key')
      expect(result.text).toBe('hi')
    })

    it('does not route a key-only Gemini model through the owner proxy', async () => {
      const proxyService = new GeminiService(null)

      await expect(proxyService.query({
        ...proxyRequest,
        modelId: 'gemini-3.5-flash',
      })).rejects.toThrow('personal Gemini API key')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
