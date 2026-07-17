const mockChat = jest.fn((modelId: string) => ({ kind: 'chat-model', modelId }))
const mockCreateOpenAI = jest.fn((_config: unknown) => ({ chat: mockChat }))

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (config: unknown) => mockCreateOpenAI(config),
}))

jest.mock('@/src/shared/config/deployment-profile.config', () => ({
  DEPLOYMENT_CONFIG: {
    profile: 'onprem',
    isCloud: false,
    isOnPrem: true,
    allowsFirebase: false,
    allowsCloudAi: false,
  },
}))

import { AiProviderFactory } from '@/src/infrastructure/ai/factories/ai-provider.factory'
import { CUSTOM_OPENAI_MODEL_ID } from '@/src/shared/constants/ai-models.constants'

describe('AiProviderFactory onprem boundary', () => {
  beforeEach(() => {
    mockChat.mockClear()
    mockCreateOpenAI.mockClear()
  })

  it.each([
    'gemini-3-flash-preview',
    'gpt-5.4-nano',
    'claude-haiku-4-5-20251001',
  ])('rejects cloud model %s before constructing a provider', (modelId) => {
    const factory = new AiProviderFactory()
    expect(() => factory.create({ modelId, apiKey: 'secret', useProxy: false }))
      .toThrow('disabled by the onprem deployment profile')
    expect(mockCreateOpenAI).not.toHaveBeenCalled()
  })

  it('allows a configured same-origin OpenAI-compatible endpoint', () => {
    const factory = new AiProviderFactory()
    const result = factory.create({
      modelId: CUSTOM_OPENAI_MODEL_ID,
      useProxy: false,
      openAiCompatible: {
        enabled: true,
        baseUrl: '/ai/v1',
        modelId: 'hospital-model',
        apiKey: null,
      },
    })

    expect(mockChat).toHaveBeenCalledWith('hospital-model')
    expect(result.model).toEqual({ kind: 'chat-model', modelId: 'hospital-model' })
  })

  it('rejects a cross-origin endpoint that is absent from the build allowlist', () => {
    const factory = new AiProviderFactory()
    expect(() => factory.create({
      modelId: CUSTOM_OPENAI_MODEL_ID,
      useProxy: false,
      openAiCompatible: {
        enabled: true,
        baseUrl: 'https://public-model.example/v1',
        modelId: 'external-model',
        apiKey: null,
      },
    })).toThrow('not allowed by the onprem deployment profile')
    expect(mockCreateOpenAI).not.toHaveBeenCalled()
  })
})
