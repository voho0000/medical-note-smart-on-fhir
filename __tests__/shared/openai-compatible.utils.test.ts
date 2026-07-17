import {
  formatOpenAiCompatibleChatCompletionsUrl,
  normalizeOpenAiCompatibleBaseUrl,
  isOpenAiCompatibleRuntimeReady,
  isOnPremOpenAiCompatibleOriginAllowed,
  openAiCompatibleCacheIdentity,
  openAiCompatibleEndpointUrl,
  OpenAiCompatibleUrlError,
  resolveDefaultOpenAiCompatibleProfile,
  resolveOpenAiCompatibleBaseUrl,
  resolveOpenAiCompatibleConversationMode,
  resolveOpenAiCompatibleProfile,
} from '@/src/shared/utils/openai-compatible.utils'
import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'
import {
  DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW,
  normalizeOpenAiCompatibleAgentCapability,
  normalizeOpenAiCompatibleAgentCapabilityTestedAt,
  normalizeOpenAiCompatibleAgentMode,
  suggestedOpenAiCompatibleContextWindow,
} from '@/src/shared/types/openai-compatible.types'

describe('OpenAI-compatible context-window suggestions', () => {
  it('uses 32,768 as the safe default for a new unknown model', () => {
    expect(DEFAULT_OPENAI_COMPATIBLE_CONTEXT_WINDOW).toBe(32768)
    expect(suggestedOpenAiCompatibleContextWindow('hospital-7b')).toBe(32768)
  })

  it.each([
    ['qwen2.5:7b', 32768],
    ['qwen2.5vl:7b', 128000],
    ['Qwen/Qwen2.5-VL-7B-Instruct', 128000],
    ['qwen3:8b', 40960],
    ['meta-llama/Llama-3.1-8B-Instruct', 131072],
  ])('suggests the known runtime window for %s', (modelId, expected) => {
    expect(suggestedOpenAiCompatibleContextWindow(modelId)).toBe(expected)
  })
})

describe('OpenAI-compatible Agent capability', () => {
  it('normalizes legacy and tampered capability fields to safe defaults', () => {
    expect(normalizeOpenAiCompatibleAgentMode(undefined)).toBe('auto')
    expect(normalizeOpenAiCompatibleAgentMode('invalid')).toBe('auto')
    expect(normalizeOpenAiCompatibleAgentMode('deep-agent')).toBe('auto')
    expect(normalizeOpenAiCompatibleAgentCapability(undefined)).toBe('unknown')
    expect(normalizeOpenAiCompatibleAgentCapability('verified')).toBe('verified')
    expect(normalizeOpenAiCompatibleAgentCapability('invalid')).toBe('unknown')
    expect(normalizeOpenAiCompatibleAgentCapabilityTestedAt(1_721_234_567_890)).toBe(
      1_721_234_567_890,
    )
    expect(normalizeOpenAiCompatibleAgentCapabilityTestedAt(-1)).toBeNull()
    expect(normalizeOpenAiCompatibleAgentCapabilityTestedAt('1721234567890')).toBeNull()
  })

  it.each([
    [{}, 'standard'],
    [{ agentMode: 'auto', agentCapability: 'unknown' }, 'standard'],
    [{ agentMode: 'auto', agentCapability: 'unsupported' }, 'standard'],
    [{ agentMode: 'auto', agentCapability: 'verified' }, 'standard'],
    [{
      agentMode: 'auto',
      agentCapability: 'verified',
      agentCapabilityTestedAt: 1_721_234_567_890,
    }, 'deep-agent'],
    [{
      agentMode: 'standard',
      agentCapability: 'verified',
      agentCapabilityTestedAt: 1_721_234_567_890,
    }, 'standard'],
  ] as const)('resolves %# to %s', (agentState, expected) => {
    expect(resolveOpenAiCompatibleConversationMode({
      enabled: true,
      baseUrl: 'https://llm.intra.example/v1',
      modelId: 'hospital-model',
      apiKey: null,
      ...agentState,
    })).toBe(expected)
  })

  it('does not let a legacy manual-deep value bypass Agent verification', () => {
    expect(resolveOpenAiCompatibleConversationMode({
      enabled: true,
      baseUrl: 'https://llm.intra.example/v1',
      modelId: 'hospital-model',
      apiKey: null,
      agentMode: 'deep-agent' as never,
      agentCapability: 'unsupported',
      agentCapabilityTestedAt: 1_721_234_567_890,
    })).toBe('standard')
  })
})

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

  it('allows only same-origin, loopback, or explicitly configured onprem origins', () => {
    expect(isOnPremOpenAiCompatibleOriginAllowed(
      'https://mediprisma.intra/ai/v1',
      'https://mediprisma.intra',
      '',
    )).toBe(true)
    expect(isOnPremOpenAiCompatibleOriginAllowed(
      'http://127.0.0.1:11434/v1',
      'https://mediprisma.intra',
      '',
    )).toBe(true)
    expect(isOnPremOpenAiCompatibleOriginAllowed(
      'https://llm.intra.example/v1',
      'https://mediprisma.intra',
      'https://llm.intra.example, https://other.intra',
    )).toBe(true)
    expect(isOnPremOpenAiCompatibleOriginAllowed(
      'https://api.openai.com/v1',
      'https://mediprisma.intra',
      'https://llm.intra.example',
    )).toBe(false)
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

  it('resolves only the profile represented by the logical model id', () => {
    const profiles = [
      {
        profileId: 'legacy',
        enabled: true,
        baseUrl: 'https://legacy.example/v1',
        modelId: 'legacy-model',
        apiKey: null,
      },
      {
        profileId: 'endpoint-b',
        enabled: true,
        baseUrl: 'https://endpoint-b.example/v1',
        modelId: 'model-b',
        apiKey: null,
      },
    ]

    expect(resolveOpenAiCompatibleProfile(
      customOpenAiModelIdForProfile('endpoint-b'),
      profiles,
    )).toBe(profiles[1])
    expect(resolveOpenAiCompatibleProfile(
      customOpenAiModelIdForProfile('deleted'),
      profiles,
    )).toBeNull()
  })

  it('uses the first runtime-ready profile for consumers without a picker', () => {
    const profiles = [
      {
        profileId: 'disabled',
        enabled: false,
        baseUrl: 'https://disabled.example/v1',
        modelId: 'disabled-model',
        apiKey: null,
      },
      {
        profileId: 'ready-b',
        enabled: true,
        baseUrl: 'https://ready-b.example/v1',
        modelId: 'ready-b',
        apiKey: null,
      },
      {
        profileId: 'ready-c',
        enabled: true,
        baseUrl: 'https://ready-c.example/v1',
        modelId: 'ready-c',
        apiKey: null,
      },
    ]

    expect(resolveDefaultOpenAiCompatibleProfile(profiles)).toBe(profiles[1])
  })
})
