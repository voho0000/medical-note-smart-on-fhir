const mockChat = jest.fn((modelId: string) => ({ kind: 'chat-model', modelId }))
const mockCreateOpenAI = jest.fn((_config: unknown) => ({ chat: mockChat }))

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (config: unknown) => mockCreateOpenAI(config),
}))

import { AiProviderFactory } from '@/src/infrastructure/ai/factories/ai-provider.factory'
import {
  CUSTOM_OPENAI_MODEL_ID,
  customOpenAiModelIdForProfile,
} from '@/src/shared/constants/ai-models.constants'

describe('AiProviderFactory custom OpenAI-compatible routing', () => {
  beforeEach(() => {
    mockChat.mockClear()
    mockCreateOpenAI.mockClear()
  })

  it('always creates a direct provider with the configured base URL and actual upstream model', () => {
    const factory = new AiProviderFactory()
    const result = factory.create({
      modelId: CUSTOM_OPENAI_MODEL_ID,
      // Even a mistaken caller cannot send this logical model to owner proxy.
      useProxy: true,
      openAiCompatible: {
        enabled: true,
        baseUrl: 'https://llm.intra.example/v1/chat/completions',
        modelId: 'hospital-model-v2',
        apiKey: null,
      },
    })

    expect(mockCreateOpenAI).toHaveBeenCalledTimes(1)
    expect(mockCreateOpenAI.mock.calls[0][0]).toMatchObject({
      baseURL: 'https://llm.intra.example/v1',
      apiKey: 'local-endpoint-no-auth',
      fetch: expect.any(Function),
    })
    expect(mockChat).toHaveBeenCalledWith('hospital-model-v2')
    expect(result.model).toEqual({ kind: 'chat-model', modelId: 'hospital-model-v2' })
  })

  it('fails closed instead of creating any provider when the profile is disabled', () => {
    const factory = new AiProviderFactory()
    expect(() => factory.create({
      modelId: CUSTOM_OPENAI_MODEL_ID,
      useProxy: false,
      openAiCompatible: {
        enabled: false,
        baseUrl: 'https://llm.intra.example/v1',
        modelId: 'hospital-model',
        apiKey: null,
      },
    })).toThrow('not configured')
    expect(mockCreateOpenAI).not.toHaveBeenCalled()
  })

  it('recognizes a profile-scoped logical model as custom', () => {
    const factory = new AiProviderFactory()
    factory.create({
      modelId: customOpenAiModelIdForProfile('endpoint-b'),
      useProxy: true,
      openAiCompatible: {
        enabled: true,
        baseUrl: 'https://endpoint-b.example/v1',
        modelId: 'upstream-b',
        apiKey: null,
      },
    })

    expect(mockChat).toHaveBeenCalledWith('upstream-b')
  })
})
