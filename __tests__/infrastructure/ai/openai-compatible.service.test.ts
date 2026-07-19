import { OpenAiCompatibleService } from '@/src/infrastructure/ai/services/openai-compatible.service'
import { getUserErrorMessage } from '@/src/core/errors'

describe('OpenAiCompatibleService', () => {
  const config = {
    enabled: true,
    baseUrl: 'https://10.20.30.40:8443/v1/chat/completions',
    modelId: 'local-medical-model',
    apiKey: null,
  }

  afterEach(() => jest.restoreAllMocks())

  const jsonResponse = (body: unknown, status = 200): Response => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  } as Response)

  it('sends the actual model directly to the configured HTTPS endpoint without auth when optional', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'local answer' } }],
      usage: { total_tokens: 42 },
    }))

    const service = new OpenAiCompatibleService(config)
    await expect(service.query({
      modelId: 'openai-compatible-custom',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      maxTokens: 64,
    })).resolves.toMatchObject({
      text: 'local answer',
      metadata: { modelId: 'local-medical-model', provider: 'custom', tokensUsed: 42 },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://10.20.30.40:8443/v1/chat/completions',
    )
    const init = fetchMock.mock.calls[0][1]
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'local-medical-model',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 64,
      stream: false,
    })
  })

  it('never falls back when the custom profile is unavailable', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
    const service = new OpenAiCompatibleService({ ...config, enabled: false })
    await expect(service.query({
      modelId: 'openai-compatible-custom',
      messages: [{ role: 'user', content: 'clinical text' }],
    })).rejects.toThrow('not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows a custom timeout and maps its abort to a stable local-model timeout', async () => {
    jest.useFakeTimers()
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('signal is aborted without reason', 'AbortError'))
      }, { once: true })
    }))

    try {
      const service = new OpenAiCompatibleService(config, 5_000)
      const pending = service.query({
        modelId: 'openai-compatible-custom',
        messages: [{ role: 'user', content: 'long clinical prompt' }],
      })
      const captured = pending.catch((error: unknown) => error)
      await jest.advanceTimersByTimeAsync(5_000)

      const error = await captured
      expect(error).toMatchObject({
        code: 'AI_TIMEOUT',
        message: expect.stringContaining('local model response timed out'),
      })
      expect(getUserErrorMessage(error)).toContain('地端模型回應逾時')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })
})
