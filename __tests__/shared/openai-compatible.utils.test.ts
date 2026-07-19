import {
  formatOpenAiCompatibleChatCompletionsUrl,
  normalizeOpenAiCompatibleBaseUrl,
  isOpenAiCompatibleRuntimeReady,
  openAiCompatibleCacheIdentity,
  openAiCompatibleEndpointUrl,
  OpenAiCompatibleUrlError,
  resolveOpenAiCompatibleBaseUrl,
} from '@/src/shared/utils/openai-compatible.utils'

describe('OpenAI-compatible URL validation', () => {
  it.each([
    ['https://llm.intra.example.org/v1/', 'https://llm.intra.example.org/v1'],
    ['https://10.20.30.40:8443/v1', 'https://10.20.30.40:8443/v1'],
    ['llm-gateway:8443/v1', 'https://llm-gateway:8443/v1'],
    ['10.20.30.40:8443/v1', 'https://10.20.30.40:8443/v1'],
    ['/ai/v1/', '/ai/v1'],
    ['http://localhost:11434/v1/', 'http://localhost:11434/v1'],
    ['http://127.0.0.1:1234/v1', 'http://127.0.0.1:1234/v1'],
    ['http://[::1]:8000/v1', 'http://[::1]:8000/v1'],
    ['https://llm.intra/v1/chat/completions', 'https://llm.intra/v1'],
    ['https://llm.intra/v1/chat/completions/', 'https://llm.intra/v1'],
    ['/ai/v1/chat/completions', '/ai/v1'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeOpenAiCompatibleBaseUrl(input)).toBe(expected)
  })

  it.each([
    ['http://10.20.30.40:8000/v1', 'INSECURE_HTTP'],
    ['ftp://llm.intra/v1', 'INVALID_PROTOCOL'],
    ['https://user:pass@llm.intra/v1', 'URL_CREDENTIALS'],
    ['https://llm.intra/v1?tenant=a', 'URL_QUERY'],
    ['https://llm.intra/v1#section', 'URL_FRAGMENT'],
    ['//llm.intra/v1', 'INVALID_URL'],
  ])('rejects unsafe or ambiguous URL %s', (input, code) => {
    expect(() => normalizeOpenAiCompatibleBaseUrl(input)).toThrow(OpenAiCompatibleUrlError)
    try {
      normalizeOpenAiCompatibleBaseUrl(input)
    } catch (error) {
      expect((error as OpenAiCompatibleUrlError).code).toBe(code)
    }
  })

  it('formats a full Chat URL while storing and routing from its canonical base', () => {
    expect(formatOpenAiCompatibleChatCompletionsUrl(
      'https://ai.j3soon.com/v1',
    )).toBe('https://ai.j3soon.com/v1/chat/completions')
    expect(formatOpenAiCompatibleChatCompletionsUrl(
      'https://ai.j3soon.com/v1/chat/completions/',
    )).toBe('https://ai.j3soon.com/v1/chat/completions')
    expect(formatOpenAiCompatibleChatCompletionsUrl('/ai/v1')).toBe(
      '/ai/v1/chat/completions',
    )

    expect(resolveOpenAiCompatibleBaseUrl('/ai/v1', 'https://mediprisma.intra')).toBe(
      'https://mediprisma.intra/ai/v1',
    )
    expect(openAiCompatibleEndpointUrl(
      '/ai/v1/chat/completions',
      '/chat/completions',
      'https://mediprisma.intra',
    )).toBe(
      'https://mediprisma.intra/ai/v1/chat/completions',
    )
    expect(openAiCompatibleEndpointUrl(
      'https://ai.j3soon.com/v1/chat/completions',
      'models',
    )).toBe('https://ai.j3soon.com/v1/models')
  })

  it('isolates caches by transport, endpoint, and model without including the key', () => {
    const base = {
      enabled: true,
      baseUrl: 'https://llm.intra/v1',
      modelId: 'local-model',
      apiKey: 'secret-a',
    }
    expect(openAiCompatibleCacheIdentity(base)).toBe(
      openAiCompatibleCacheIdentity({ ...base, apiKey: 'secret-b' }),
    )
    expect(openAiCompatibleCacheIdentity(base)).not.toBe(
      openAiCompatibleCacheIdentity({ ...base, modelId: 'another-model' }),
    )
    expect(openAiCompatibleCacheIdentity(base)).not.toBe(
      openAiCompatibleCacheIdentity({ ...base, baseUrl: 'https://other.intra/v1' }),
    )
    expect(openAiCompatibleCacheIdentity(base)).not.toBe(
      openAiCompatibleCacheIdentity({ ...base, transport: 'mediprisma-gateway' }),
    )
  })

  it('fails closed for a Gateway profile when this deployment has no Gateway', () => {
    const gatewayProfile = {
      enabled: true,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      modelId: 'nvidia/model',
      apiKey: 'secret',
      transport: 'mediprisma-gateway' as const,
    }
    expect(isOpenAiCompatibleRuntimeReady(gatewayProfile, false)).toBe(false)
    expect(isOpenAiCompatibleRuntimeReady(gatewayProfile, true)).toBe(true)
    expect(isOpenAiCompatibleRuntimeReady({
      ...gatewayProfile,
      transport: 'direct',
    }, false)).toBe(true)
  })
})
