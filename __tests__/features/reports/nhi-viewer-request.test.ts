import {
  getNhiViewerActions,
  isTrustedLegacyNhiViewerAttachment,
  isSupportedNhiViewerOrigin,
  MAX_NHI_VIEWER_URL_LENGTH,
  MEDIPRISMA_LOCAL_DEV_ORIGIN,
  MEDIPRISMA_ORIGIN,
  NHI_VIEWER_REQUEST_EXTENSION_URL,
  parseNhiViewerRequestExtension,
  requestNhiViewerOpen,
  resetNhiViewerRequestForTests,
} from '@/features/clinical-summary/reports/utils/nhi-viewer-request'

const HASH = 'a'.repeat(64)
const LEGACY_URL = 'https://medvpnimg.nhi.gov.tw/ZFP?ticket=short-lived#pl=viewer-payload'

function requestExtension(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    version: 1,
    'proc-id': 'IMUE0130',
    'patient-context-hash': HASH,
    'ipl-case-seq-no': 'CASE-123',
    'read-pos': 'R',
    'ord-mark': 'Y',
    'file-type': 'CT',
    'file-qty': '2',
    'fee-ym': '11508',
    ...overrides,
  }
  return {
    url: NHI_VIEWER_REQUEST_EXTENSION_URL,
    extension: Object.entries(values).map(([url, value]) => ({
      url,
      ...(url === 'version' ? { valueInteger: value } : url === 'proc-id' || url === 'ord-mark'
        ? { valueCode: value }
        : { valueString: value }),
    })),
  }
}

const DESCRIPTOR = {
  version: 1 as const,
  procId: 'IMUE0130' as const,
  patientContextHash: HASH,
  iplCaseSeqNo: 'CASE-123',
  readPos: 'R',
  ordMark: 'Y' as const,
  fileType: 'CT',
  fileQty: '2',
  feeYm: '11508',
}

describe('NHI Viewer request descriptor', () => {
  it('parses the canonical live request and defaults absent optional fields', () => {
    expect(parseNhiViewerRequestExtension(requestExtension())).toEqual(DESCRIPTOR)
    expect(parseNhiViewerRequestExtension(requestExtension({
      'read-pos': undefined,
      'ord-mark': 'N',
      'file-type': undefined,
      'file-qty': undefined,
      'fee-ym': undefined,
    }))).toEqual({
      ...DESCRIPTOR,
      readPos: '',
      ordMark: '',
      fileType: '',
      fileQty: '',
      feeYm: '',
    })
  })

  it.each([
    ['wrong version', { version: 2 }],
    ['wrong procedure', { 'proc-id': 'OTHER' }],
    ['bad patient hash', { 'patient-context-hash': 'not-a-sha256' }],
    ['missing case sequence', { 'ipl-case-seq-no': '' }],
  ])('rejects %s', (_label, override) => {
    expect(parseNhiViewerRequestExtension(requestExtension(override))).toBeNull()
  })

  it('lets any canonical live extension win and never exposes its stale legacy URL', () => {
    const legacy = { contentType: 'text/html', url: LEGACY_URL, title: 'Old URL' }
    expect(getNhiViewerActions({
      extension: [requestExtension()],
      presentedForm: [legacy],
    })).toEqual([{ kind: 'live', descriptor: DESCRIPTOR }])

    // Even a malformed canonical extension must not silently fall back to a
    // patient-bound URL captured at import time.
    expect(getNhiViewerActions({
      extension: [requestExtension({ version: 2 })],
      presentedForm: [legacy],
    })).toEqual([])
  })

  it('preserves multiple canonical extensions independently without deduplication', () => {
    expect(getNhiViewerActions({
      extension: [requestExtension(), requestExtension()],
    })).toEqual([
      { kind: 'live', descriptor: DESCRIPTOR },
      { kind: 'live', descriptor: DESCRIPTOR },
    ])
  })
})

describe('legacy NHI Viewer URL fallback', () => {
  it.each([
    LEGACY_URL,
    'https://meddcm.nhi.gov.tw/zfp/IMME/Abcd_efgh-123456',
    'https://meddcmc.nhi.gov.tw/zfp/IMME/Abcd_efgh-123456==',
    'https://nhi.gov.tw',
    'https://viewer.next.nhi.gov.tw/future/opaque?query=1#fragment',
  ])('accepts HTTPS inside the NHI DNS boundary: %s', (url) => {
    expect(isTrustedLegacyNhiViewerAttachment({
      contentType: ' Text/HTML ; charset=utf-8',
      url,
    })).toBe(true)
  })

  it.each([
    ['non-HTML', { contentType: 'application/dicom', url: LEGACY_URL }],
    ['non-HTTPS', { contentType: 'text/html', url: 'http://meddcm.nhi.gov.tw/zfp/x' }],
    ['suffix attack', { contentType: 'text/html', url: 'https://meddcm.nhi.gov.tw.attacker.example/zfp/x' }],
    ['hyphen lookalike', { contentType: 'text/html', url: 'https://fake-nhi.gov.tw/zfp/x' }],
    ['missing label boundary', { contentType: 'text/html', url: 'https://reallynhi.gov.tw/zfp/x' }],
    ['credentials', { contentType: 'text/html', url: 'https://user@meddcm.nhi.gov.tw/zfp/x' }],
    ['custom port', { contentType: 'text/html', url: 'https://meddcm.nhi.gov.tw:444/zfp/x' }],
    ['malformed', { contentType: 'text/html', url: 'not a url' }],
  ])('rejects %s', (_label, attachment) => {
    expect(isTrustedLegacyNhiViewerAttachment(attachment)).toBe(false)
  })

  it('rejects a URL over the capability-length ceiling', () => {
    const prefix = 'https://meddcm.nhi.gov.tw/zfp/'
    const url = prefix + 'x'.repeat(MAX_NHI_VIEWER_URL_LENGTH - prefix.length + 1)
    expect(isTrustedLegacyNhiViewerAttachment({ contentType: 'text/html', url })).toBe(false)
  })
})

describe('NHI Viewer window messaging', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    resetNhiViewerRequestForTests()
  })

  it('posts only the URL-free descriptor to the fixed MediPrisma origin', async () => {
    const post = jest.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const pending = requestNhiViewerOpen(DESCRIPTOR, 20_000, MEDIPRISMA_ORIGIN)
    const [message, targetOrigin] = post.mock.calls[0]
    const requestId = (message as any).requestId

    expect(targetOrigin).toBe(MEDIPRISMA_ORIGIN)
    expect(message).toMatchObject({
      source: 'mediprisma',
      type: 'MEDIPRISMA_NHI_VIEWER_OPEN_REQUEST',
      version: 1,
      requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      patientContextHash: HASH,
      descriptor: {
        version: 1,
        procId: 'IMUE0130',
        iplCaseSeqNo: 'CASE-123',
      },
    })
    expect(JSON.stringify(message)).not.toContain('http')
    expect((message as any).descriptor).not.toHaveProperty('patientContextHash')

    window.dispatchEvent(new MessageEvent('message', {
      origin: MEDIPRISMA_ORIGIN,
      source: window,
      data: {
        source: 'medcloud2-extension',
        type: 'MEDIPRISMA_NHI_VIEWER_OPEN_RESULT',
        version: 1,
        requestId,
        ok: true,
      },
    }))
    await expect(pending).resolves.toEqual({ ok: true })
  })

  it('uses the exact localhost:3001 origin in development', async () => {
    const post = jest.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const pending = requestNhiViewerOpen(DESCRIPTOR, 20_000, MEDIPRISMA_LOCAL_DEV_ORIGIN)
    const [message, targetOrigin] = post.mock.calls[0]
    const requestId = (message as any).requestId

    expect(targetOrigin).toBe(MEDIPRISMA_LOCAL_DEV_ORIGIN)

    window.dispatchEvent(new MessageEvent('message', {
      origin: MEDIPRISMA_LOCAL_DEV_ORIGIN,
      source: window,
      data: {
        source: 'medcloud2-extension',
        type: 'MEDIPRISMA_NHI_VIEWER_OPEN_RESULT',
        version: 1,
        requestId,
        ok: true,
      },
    }))
    await expect(pending).resolves.toEqual({ ok: true })
  })

  it('ignores untrusted results, maps unknown errors safely, and prevents concurrent requests', async () => {
    const post = jest.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const first = requestNhiViewerOpen(DESCRIPTOR, 20_000, MEDIPRISMA_ORIGIN)
    await expect(requestNhiViewerOpen(DESCRIPTOR, 20_000, MEDIPRISMA_ORIGIN)).resolves.toEqual({
      ok: false,
      code: 'REQUEST_IN_PROGRESS',
    })
    const requestId = (post.mock.calls[0][0] as any).requestId

    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://attacker.example',
      source: window,
      data: {
        source: 'medcloud2-extension',
        type: 'MEDIPRISMA_NHI_VIEWER_OPEN_RESULT',
        version: 1,
        requestId,
        ok: true,
      },
    }))
    window.dispatchEvent(new MessageEvent('message', {
      origin: MEDIPRISMA_ORIGIN,
      source: window,
      data: {
        source: 'medcloud2-extension',
        type: 'MEDIPRISMA_NHI_VIEWER_OPEN_RESULT',
        version: 1,
        requestId,
        ok: false,
        code: 'UNRECOGNIZED_ERROR',
      },
    }))
    await expect(first).resolves.toEqual({ ok: false, code: 'OPEN_FAILED' })
  })

  it('times out after 20 seconds without treating the Bundle as invalid', async () => {
    jest.useFakeTimers()
    jest.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const pending = requestNhiViewerOpen(DESCRIPTOR, 20_000, MEDIPRISMA_ORIGIN)
    jest.advanceTimersByTime(20_000)
    await expect(pending).resolves.toEqual({ ok: false, code: 'EXTENSION_UNAVAILABLE' })
  })

  it('does not post a malformed descriptor', async () => {
    const post = jest.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    await expect(requestNhiViewerOpen({
      ...DESCRIPTOR,
      patientContextHash: 'bad-hash',
    }, 20_000, MEDIPRISMA_ORIGIN)).resolves.toEqual({ ok: false, code: 'INVALID_REQUEST' })
    expect(post).not.toHaveBeenCalled()
  })

  it('allows localhost:3001 only outside production builds', () => {
    expect(isSupportedNhiViewerOrigin(MEDIPRISMA_ORIGIN, 'production')).toBe(true)
    expect(isSupportedNhiViewerOrigin(MEDIPRISMA_LOCAL_DEV_ORIGIN, 'development')).toBe(true)
    expect(isSupportedNhiViewerOrigin(MEDIPRISMA_LOCAL_DEV_ORIGIN, 'production')).toBe(false)
  })

  it('fails immediately outside the supported origins instead of waiting 20 seconds', async () => {
    const post = jest.spyOn(window, 'postMessage').mockImplementation(() => undefined)

    await expect(requestNhiViewerOpen(DESCRIPTOR, 20_000, 'http://localhost:3002')).resolves.toEqual({
      ok: false,
      code: 'UNSUPPORTED_ORIGIN',
    })
    expect(post).not.toHaveBeenCalled()
  })
})
