import { PerplexityService } from '@/src/infrastructure/ai/services/perplexity.service'
import { cancelCollectorRequests } from '@/src/application/telemetry/collector'
import { mockCollectorPermission } from '../../helpers/collector-permissions'

jest.mock('@/src/infrastructure/telemetry/collector-auth', () => ({
  captureCollectorAuth: async () => ({ getToken: async () => 'synthetic-firebase-token' }),
}))

jest.mock('@/src/shared/config/env.config', () => ({ ENV_CONFIG: { perplexityProxyUrl: 'https://synthetic.invalid/search' } }))
jest.mock('@/src/infrastructure/ai/utils/proxy-auth', () => ({ getProxyAuthHeaders: async () => ({}) }))

let permission: ReturnType<typeof mockCollectorPermission>
beforeEach(() => { permission = mockCollectorPermission() })
afterEach(() => { cancelCollectorRequests(); permission.restore(); window.history.replaceState({}, '', '/') })
test('search returns its result while logging is unavailable, excluding query, citations and key', async () => {
  window.history.replaceState({}, '', '/?site=vghtpe')

  jest.mocked(fetch).mockImplementation(async (url) => {
    if (String(url).includes('/collector/v1/events')) throw new Error('offline')
    return { ok: true, status: 200, json: async () => ({ content: 'SYNTHETIC-ANSWER', citations: ['https://synthetic.invalid/private'] }) } as Response
  })
  expect(await new PerplexityService().searchLiterature('SYNTHETIC-QUERY', 'SYNTHETIC-KEY')).toMatchObject({ success: true, content: 'SYNTHETIC-ANSWER' })
  for (let i = 0; i < 24; i++) await Promise.resolve()
  const call = jest.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/collector/v1/events'))
  expect(call).toBeDefined()
  expect(String(call?.[1]?.body)).not.toMatch(/SYNTHETIC-QUERY|SYNTHETIC-KEY|SYNTHETIC-ANSWER|citations/)
})
