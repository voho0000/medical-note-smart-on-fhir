import { AiService } from '@/src/infrastructure/ai/services/ai.service'
import { customOpenAiModelIdForProfile } from '@/src/shared/constants/ai-models.constants'
import type { OpenAiCompatibleProfile } from '@/src/shared/types/openai-compatible.types'

const profiles: OpenAiCompatibleProfile[] = [
  {
    profileId: 'endpoint-a',
    enabled: true,
    baseUrl: 'https://endpoint-a.example/v1',
    modelId: 'model-a',
    apiKey: 'key-a',
  },
  {
    profileId: 'endpoint-b',
    enabled: true,
    baseUrl: 'https://endpoint-b.example/v1',
    modelId: 'model-b',
    apiKey: 'key-b',
  },
]

describe('AiService custom profile routing', () => {
  afterEach(() => jest.restoreAllMocks())

  it('routes a dynamic logical model id to that exact profile', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ choices: [{ message: { content: 'from b' } }] }),
    } as Response)
    const service = new AiService(null, null, null, profiles)

    await expect(service.query({
      modelId: customOpenAiModelIdForProfile('endpoint-b'),
      messages: [{ role: 'user', content: 'hello' }],
    })).resolves.toMatchObject({ text: 'from b' })

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://endpoint-b.example/v1/chat/completions',
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: 'model-b',
    })
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer key-b',
    )
  })

  it('fails closed after the selected profile has been deleted', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
    const service = new AiService(null, null, null, profiles)

    await expect(service.query({
      modelId: customOpenAiModelIdForProfile('deleted-endpoint'),
      messages: [{ role: 'user', content: 'clinical data' }],
    })).rejects.toThrow('not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
