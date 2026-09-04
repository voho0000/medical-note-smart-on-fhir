/**
 * @jest-environment-options {"url": "https://mediprisma.tw/app/"}
 */
// Launch context — the coarse labels that answer "which route was this
// app opened through". Every branch matters: they are the only thing standing
// between a useful per-route count and a URL that must never be reported.
export {}

const mockIsMedcloudLaunchRoute = jest.fn(() => false)
const mockIsDemoDataActive = jest.fn(() => false)
const mockGetAiDataSourceState = jest.fn(() => ({ source: 'other', importId: null as string | null }))
const mockHasSmartContext = jest.fn(() => false)

jest.mock('@/src/application/launch/medcloud-launch-route', () => ({
  isMedcloudLaunchRoute: () => mockIsMedcloudLaunchRoute(),
}))

jest.mock('@/src/application/hooks/ai-generation/ai-data-source', () => ({
  isDemoDataActive: () => mockIsDemoDataActive(),
  getAiDataSourceState: () => mockGetAiDataSourceState(),
}))

jest.mock('@/src/infrastructure/fhir/client/fhir-client.service', () => ({
  hasSmartContext: () => mockHasSmartContext(),
}))

import {
  detectLaunchSource,
  detectSite,
  detectWorkstation,
} from '@/src/application/telemetry/launch-context'

describe('detectLaunchSource', () => {
  beforeEach(() => {
    mockIsMedcloudLaunchRoute.mockReturnValue(false)
    mockIsDemoDataActive.mockReturnValue(false)
    mockGetAiDataSourceState.mockReturnValue({ source: 'other', importId: null })
    mockHasSmartContext.mockReturnValue(false)
  })

  it('gives the Medcloud route priority over everything else', async () => {
    mockIsMedcloudLaunchRoute.mockReturnValue(true)
    mockIsDemoDataActive.mockReturnValue(true)
    mockGetAiDataSourceState.mockReturnValue({ source: 'local', importId: 'import-1' })
    mockHasSmartContext.mockReturnValue(true)

    await expect(detectLaunchSource()).resolves.toBe('medcloud2')
  })

  it('reports the bundled demo patient', async () => {
    mockIsDemoDataActive.mockReturnValue(true)
    await expect(detectLaunchSource()).resolves.toBe('demo')
  })

  it('reports an imported bundle', async () => {
    mockGetAiDataSourceState.mockReturnValue({ source: 'local', importId: 'import-1' })
    await expect(detectLaunchSource()).resolves.toBe('import')
  })

  it('reports a live SMART session', async () => {
    mockHasSmartContext.mockReturnValue(true)
    await expect(detectLaunchSource()).resolves.toBe('smart')
  })

  it('reports "none" when nothing is loaded', async () => {
    await expect(detectLaunchSource()).resolves.toBe('none')
  })

  it('falls back to "none" instead of throwing when storage is unavailable', async () => {
    mockIsDemoDataActive.mockImplementation(() => {
      throw new Error('sessionStorage unavailable')
    })
    await expect(detectLaunchSource()).resolves.toBe('none')
  })
})

describe('detectSite', () => {
  const originalUrl = window.location.href

  afterEach(() => {
    window.history.replaceState({}, '', originalUrl)
  })

  it('recognises the VGH-TPE hand-off marker', () => {
    window.history.replaceState({}, '', '/?site=vghtpe&medcloud2=auto')
    expect(detectSite()).toBe('vghtpe')
  })

  it('reports "unknown" for any other site value', () => {
    window.history.replaceState({}, '', '/?site=other')
    expect(detectSite()).toBe('unknown')
  })

  it('reports "unknown" when there is no site parameter', () => {
    window.history.replaceState({}, '', '/')
    expect(detectSite()).toBe('unknown')
  })
})

// The launch parser only trusts the production origin + /app/ path, so this
// file runs on that URL (jsdom cannot change origin at runtime; the query is
// varied with replaceState).
describe('detectWorkstation', () => {
  const originalUrl = window.location.href

  afterEach(() => {
    window.history.replaceState({}, '', originalUrl)
  })

  it('reports the launcher-supplied clinic-room code', () => {
    window.history.replaceState({}, '', '/app/?medcloud2=auto&site=vghtpe&ws=OPD-3F-01')
    expect(detectWorkstation()).toBe('OPD-3F-01')
  })

  it('reports "unknown" when the launcher supplied none', () => {
    window.history.replaceState({}, '', '/app/?site=vghtpe')
    expect(detectWorkstation()).toBe('unknown')
  })

  it('reports "unknown" for a malformed code — the parser rejects the URL', () => {
    window.history.replaceState({}, '', '/app/?site=vghtpe&ws=a b')
    expect(detectWorkstation()).toBe('unknown')
    window.history.replaceState({}, '', '/app/?site=vghtpe&ws=')
    expect(detectWorkstation()).toBe('unknown')
  })
})
