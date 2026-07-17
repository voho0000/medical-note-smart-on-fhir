import {
  normalizeOpenAiCompatibleBaseUrl,
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
  ])('normalizes %s', (input, expected) => {
    expect(normalizeOpenAiCompatibleBaseUrl(input)).toBe(expected)
  })

  it.each([
    ['http://10.20.30.40:8000/v1', 'INSECURE_HTTP'],
    ['ftp://llm.intra/v1', 'INVALID_PROTOCOL'],
    ['https://user:pass@llm.intra/v1', 'URL_CREDENTIALS'],
    ['https://llm.intra/v1?tenant=a', 'URL_QUERY'],
    ['https://llm.intra/v1#section', 'URL_FRAGMENT'],
    ['https://llm.intra/v1/chat/completions', 'FULL_COMPLETIONS_URL'],
    ['/ai/v1/chat/completions', 'FULL_COMPLETIONS_URL'],
    ['//llm.intra/v1', 'INVALID_URL'],
  ])('rejects unsafe or ambiguous URL %s', (input, code) => {
    expect(() => normalizeOpenAiCompatibleBaseUrl(input)).toThrow(OpenAiCompatibleUrlError)
    try {
      normalizeOpenAiCompatibleBaseUrl(input)
    } catch (error) {
      expect((error as OpenAiCompatibleUrlError).code).toBe(code)
    }
  })

  it('resolves a same-origin gateway and appends API paths once', () => {
    expect(resolveOpenAiCompatibleBaseUrl('/ai/v1', 'https://mediprisma.intra')).toBe(
      'https://mediprisma.intra/ai/v1',
    )
    expect(openAiCompatibleEndpointUrl('/ai/v1', '/chat/completions', 'https://mediprisma.intra')).toBe(
      'https://mediprisma.intra/ai/v1/chat/completions',
    )
  })

  it('isolates caches by endpoint and upstream model without including the key', () => {
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
  })
})
