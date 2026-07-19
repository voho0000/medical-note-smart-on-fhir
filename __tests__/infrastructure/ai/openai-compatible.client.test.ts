import {
  createOpenAiCompatibleFetch,
  createOpenAiCompatibleGatewayFetch,
  testOpenAiCompatibleConnection,
} from '@/src/infrastructure/ai/openai-compatible/openai-compatible.client'

jest.mock('@/src/infrastructure/ai/utils/proxy-auth', () => ({
  getProxyIdToken: jest.fn(async () => 'firebase-id-token'),
}))
jest.mock('@/src/infrastructure/ai/utils/app-check', () => ({
  getAppCheckToken: jest.fn(async () => 'app-check-token'),
}))

const profile = {
  enabled: true,
  baseUrl: 'https://llm.intra.example/v1',
  modelId: 'hospital-model',
  apiKey: 'hospital-secret',
}

const jsonResponse = (body: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 404 ? 'Not Found' : 'OK',
  json: async () => body,
} as Response)

describe('OpenAI-compatible browser client', () => {
  it('tests /models directly and reports whether the model exists', async () => {
    const fetchImpl = jest.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => jsonResponse({
      data: [{ id: 'hospital-model' }, { id: 'other-model' }],
    })) as jest.MockedFunction<typeof fetch>

    await expect(testOpenAiCompatibleConnection(profile, { fetchImpl })).resolves.toEqual({
      models: ['hospital-model', 'other-model'],
      modelFound: true,
      usedChatProbe: false,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://llm.intra.example/v1/models')
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer hospital-secret')
  })

  it('falls back to a patient-free one-token chat probe when /models is absent', async () => {
    const fetchImpl = jest.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => jsonResponse(null, 404)) as jest.MockedFunction<typeof fetch>
    fetchImpl
      .mockResolvedValueOnce(jsonResponse(null, 404))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: 'OK' } }],
      }))

    const result = await testOpenAiCompatibleConnection(
      { ...profile, apiKey: null },
      { fetchImpl },
    )
    expect(result).toEqual({ models: [], modelFound: null, usedChatProbe: true })
    expect(String(fetchImpl.mock.calls[1][0])).toBe(
      'https://llm.intra.example/v1/chat/completions',
    )
    const init = fetchImpl.mock.calls[1][1]
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'hospital-model',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 1,
      stream: false,
    })
  })

  it('uses the configured model literally when /models is forbidden', async () => {
    const fetchImpl = jest.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => jsonResponse(null, 403)) as jest.MockedFunction<typeof fetch>
    fetchImpl
      .mockResolvedValueOnce(jsonResponse({ error: 'model listing forbidden' }, 403))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: 'OK' } }],
      }))

    await expect(testOpenAiCompatibleConnection(
      {
        ...profile,
        baseUrl: 'https://llm.intra.example/v1/chat/completions',
        modelId: 'MODEL_NAME',
      },
      { fetchImpl },
    )).resolves.toEqual({ models: [], modelFound: null, usedChatProbe: true })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://llm.intra.example/v1/models',
    )
    expect(String(fetchImpl.mock.calls[1][0])).toBe(
      'https://llm.intra.example/v1/chat/completions',
    )
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toMatchObject({
      model: 'MODEL_NAME',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 1,
      stream: false,
    })
  })

  it('surfaces a forbidden Chat Completions probe after /models is forbidden', async () => {
    const forbiddenResponse = {
      ok: false,
      status: 403,
      statusText: '',
      json: async () => null,
    } as Response
    const fetchImpl = jest.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => forbiddenResponse) as jest.MockedFunction<typeof fetch>

    await expect(testOpenAiCompatibleConnection(profile, { fetchImpl }))
      .rejects.toThrow('HTTP 403')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not probe Chat Completions when /models rejects authentication', async () => {
    const fetchImpl = jest.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => jsonResponse({ error: 'invalid key' }, 401)) as jest.MockedFunction<typeof fetch>

    await expect(testOpenAiCompatibleConnection(profile, { fetchImpl }))
      .rejects.toThrow('HTTP 401: invalid key')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('strips the SDK placeholder Authorization header for keyless endpoints', async () => {
    const originalFetch = global.fetch
    const fetchMock = jest.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => jsonResponse({})) as jest.MockedFunction<typeof fetch>
    global.fetch = fetchMock
    try {
      const customFetch = createOpenAiCompatibleFetch(null)
      await customFetch('https://llm.intra.example/v1/chat/completions', {
        headers: { Authorization: 'Bearer local-endpoint-no-auth' },
      })
      expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      })
    } finally {
      global.fetch = originalFetch
    }
  })

  it('routes an explicit Gateway profile through Firebase without confusing the two keys', async () => {
    const fetchImpl = jest.fn(async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => jsonResponse({
      data: [{ id: 'nvidia/nemotron-3-ultra-550b-a55b' }],
    })) as jest.MockedFunction<typeof fetch>

    await expect(testOpenAiCompatibleConnection({
      enabled: true,
      baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
      modelId: 'nvidia/nemotron-3-ultra-550b-a55b',
      apiKey: 'nvidia-user-key',
      transport: 'mediprisma-gateway',
    }, {
      fetchImpl,
      gatewayUrl: 'https://gateway.example/proxyOpenAiCompatibleGateway',
    })).resolves.toMatchObject({ modelFound: true })

    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://gateway.example/proxyOpenAiCompatibleGateway',
    )
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer firebase-id-token')
    expect(headers.get('X-Firebase-AppCheck')).toBe('app-check-token')
    expect(headers.get('X-Upstream-API-Key')).toBe('nvidia-user-key')
    expect(headers.get('X-Upstream-Base-URL')).toBe(
      'https://integrate.api.nvidia.com/v1',
    )
    expect(headers.get('X-Upstream-Path')).toBe('models')
  })

  it('refuses to send credentials through a non-HTTPS Gateway URL', () => {
    expect(() => createOpenAiCompatibleGatewayFetch({
      ...profile,
      transport: 'mediprisma-gateway',
    }, {
      gatewayUrl: 'http://gateway.example/proxyOpenAiCompatibleGateway',
    })).toThrow('MediPrisma Gateway must use HTTPS')
  })
})
