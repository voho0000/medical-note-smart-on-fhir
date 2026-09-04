/** @jest-environment node */

import { ProxyFetchInterceptor } from '@/src/infrastructure/ai/interceptors/proxy-fetch.interceptor'

jest.mock('@/src/infrastructure/ai/utils/proxy-auth', () => ({
  getProxyIdToken: jest.fn().mockResolvedValue('test-firebase-id-token'),
}))
jest.mock('@/src/infrastructure/ai/utils/app-check', () => ({
  getAppCheckToken: jest.fn().mockResolvedValue('test-app-check-token'),
}))

describe('Gemini proxy model routing', () => {
  it.each([
    ['streamGenerateContent', true],
    ['generateContent', false],
  ] as const)('preserves the selected model and native tool parts for %s', async (endpoint, streaming) => {
    const response = new Response('ok')
    const fetch = global.fetch as jest.Mock
    fetch.mockResolvedValueOnce(response)
    const proxyFetch = new ProxyFetchInterceptor().createProxyFetch({
      proxyUrl: 'https://proxy.example.com/gemini',
      proxyClientKey: 'test-client-key',
      isGemini: true,
      modelId: 'gemini-3.8-flash',
    })
    const nativeBody = {
      contents: [
        { role: 'model', parts: [{ functionCall: { name: 'lookup', args: {} }, thoughtSignature: 'test-signature' }] },
        { role: 'user', parts: [{ functionResponse: { name: 'lookup', response: { result: 'ok' } } }] },
      ],
      generationConfig: { temperature: 1 },
    }

    const result = await proxyFetch(
      `https://sdk.example.com/models/gemini-3.8-flash:${endpoint}`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': 'proxy-dummy-key' },
        body: JSON.stringify(nativeBody),
      },
    )

    expect(result).toBe(response)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://proxy.example.com/gemini')
    expect(JSON.parse(init.body)).toEqual({
      ...nativeBody,
      model: 'gemini-3.8-flash',
      __proxyStreaming: streaming,
    })
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer test-firebase-id-token')
    expect(headers.get('x-firebase-appcheck')).toBe('test-app-check-token')
    expect(headers.get('x-goog-api-key')).toBeNull()
  })
})
