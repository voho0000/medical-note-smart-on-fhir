import {
  createOpenAiCompatibleFetch,
  testOpenAiCompatibleConnection,
} from '@/src/infrastructure/ai/openai-compatible/openai-compatible.client'

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
})
