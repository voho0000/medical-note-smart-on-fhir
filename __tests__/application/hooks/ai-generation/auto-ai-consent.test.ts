import { act, renderHook } from '@testing-library/react'
import {
  AUTO_AI_REAL_DATA_DECISION_KEY,
  LOCAL_IMPORT_AI_CONSENT_KEY,
  LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS,
  canAutoRunAi,
  clearLocalImportAiConsent,
  ensureLocalImportAiConsent,
  getAutoAiConsentState,
  getAutoAiRealDataDecision,
  getLocalImportAiConsent,
  hasAutoAiRealDataConsent,
  isAutoAiEnabledForSource,
  markLocalImportAiConsentReady,
  recordAutoAiRealDataDecision,
  recordLocalImportAiDecision,
  startLocalImportAiConsent,
  useAutoAiConsentState,
} from '@/src/application/hooks/ai-generation/auto-ai-consent'
import { LocalBundleService, DEMO_FLAG_KEY } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { BUNDLE_CHANGED_EVENT } from '@/src/shared/utils/reset-on-bundle-change'

const NOW = Date.UTC(2026, 6, 18, 12)

describe('source-aware automatic AI consent', () => {
  let hasLocalData: jest.SpyInstance<boolean, []>

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearLocalImportAiConsent()
    hasLocalData = jest.spyOn(LocalBundleService, 'hasData').mockReturnValue(false)
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('SMART/other real-data preference', () => {
    it('keeps automatic cloud analysis gated until an explicit opt-in', () => {
      expect(getAutoAiRealDataDecision()).toBeNull()
      expect(hasAutoAiRealDataConsent()).toBe(false)

      recordAutoAiRealDataDecision('auto')

      expect(localStorage.getItem(AUTO_AI_REAL_DATA_DECISION_KEY)).toBe('auto')
      expect(hasAutoAiRealDataConsent()).toBe(true)
      expect(getAutoAiConsentState()).toEqual({
        source: 'other',
        decision: 'auto',
        importId: null,
      })
    })

    it('remembers a manual-only choice without treating it as consent', () => {
      recordAutoAiRealDataDecision('manual')

      expect(getAutoAiRealDataDecision()).toBe('manual')
      expect(hasAutoAiRealDataConsent()).toBe(false)
    })
  })

  describe('local-import scope', () => {
    beforeEach(() => hasLocalData.mockReturnValue(true))

    it('starts every import locked and exposes pending only after its Bundle is ready', () => {
      expect(startLocalImportAiConsent('import-a', NOW)).toEqual({
        importId: 'import-a',
        decision: 'preparing',
        startedAt: NOW,
        version: 1,
      })
      expect(JSON.parse(sessionStorage.getItem(LOCAL_IMPORT_AI_CONSENT_KEY)!)).toEqual({
        importId: 'import-a',
        decision: 'preparing',
        startedAt: NOW,
        version: 1,
      })
      expect(getAutoAiConsentState(NOW)).toEqual({
        source: 'local',
        decision: 'preparing',
        importId: 'import-a',
      })
      expect(recordLocalImportAiDecision('import-a', 'auto', NOW)).toBe(false)

      expect(markLocalImportAiConsentReady('import-a', NOW)).toBe(true)
      expect(getAutoAiConsentState(NOW).decision).toBe('pending')
    })

    it('does not inherit a global auto preference when the local record is absent', () => {
      recordAutoAiRealDataDecision('auto')

      expect(getAutoAiConsentState(NOW)).toEqual({
        source: 'local',
        decision: 'pending',
        importId: null,
      })
      expect(canAutoRunAi(getAutoAiConsentState(NOW))).toBe(false)
    })

    it('records only the expected import id so a stale dialog cannot authorize newer data', () => {
      startLocalImportAiConsent('import-new', NOW)
      markLocalImportAiConsentReady('import-new', NOW)

      expect(recordLocalImportAiDecision('import-old', 'auto', NOW + 10)).toBe(false)
      expect(recordLocalImportAiDecision(
        'import-new',
        'pending' as Parameters<typeof recordLocalImportAiDecision>[1],
        NOW + 10,
      )).toBe(false)
      expect(getLocalImportAiConsent(NOW + 10)?.decision).toBe('pending')

      expect(recordLocalImportAiDecision('import-new', 'auto', NOW + 20)).toBe(true)
      expect(getLocalImportAiConsent(NOW + 20)).toEqual({
        importId: 'import-new',
        decision: 'auto',
        startedAt: NOW,
        decidedAt: NOW + 20,
        version: 1,
      })
      expect(canAutoRunAi(getAutoAiConsentState(NOW + 20))).toBe(true)
    })

    it('replaces an earlier auto decision with pending for the next import', () => {
      startLocalImportAiConsent('import-a', NOW)
      markLocalImportAiConsentReady('import-a', NOW)
      recordLocalImportAiDecision('import-a', 'auto', NOW + 10)

      startLocalImportAiConsent('import-b', NOW + 20)

      expect(getLocalImportAiConsent(NOW + 20)).toEqual({
        importId: 'import-b',
        decision: 'preparing',
        startedAt: NOW + 20,
        version: 1,
      })
    })

    it('fails closed if the new import cannot replace an older auto receipt', () => {
      startLocalImportAiConsent('import-a', NOW)
      markLocalImportAiConsentReady('import-a', NOW)
      recordLocalImportAiDecision('import-a', 'auto', NOW + 10)
      const oldReceipt = sessionStorage.getItem(LOCAL_IMPORT_AI_CONSENT_KEY)
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('storage full', 'QuotaExceededError')
      })
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('storage unavailable', 'SecurityError')
      })

      expect(startLocalImportAiConsent('import-b', NOW + 20)).toEqual({
        importId: 'import-b',
        decision: 'preparing',
        startedAt: NOW + 20,
        version: 1,
      })

      // The old receipt physically remains, but the synchronous volatile scope
      // is authoritative and keeps B locked with a usable CAS id.
      expect(sessionStorage.getItem(LOCAL_IMPORT_AI_CONSENT_KEY)).toBe(oldReceipt)
      expect(getLocalImportAiConsent(NOW + 20)).toEqual({
        importId: 'import-b',
        decision: 'preparing',
        startedAt: NOW + 20,
        version: 1,
      })
      expect(canAutoRunAi(getAutoAiConsentState(NOW + 20))).toBe(false)
      window.dispatchEvent(new StorageEvent('storage', {
        key: LOCAL_IMPORT_AI_CONSENT_KEY,
        newValue: oldReceipt,
      }))
      expect(getLocalImportAiConsent(NOW + 20)?.importId).toBe('import-b')

      expect(recordLocalImportAiDecision('import-b', 'auto', NOW + 30)).toBe(false)
      expect(markLocalImportAiConsentReady('import-b', NOW + 30)).toBe(true)
      expect(getAutoAiConsentState(NOW + 30).decision).toBe('pending')
      expect(recordLocalImportAiDecision('import-b', 'manual', NOW + 40)).toBe(true)
      expect(getAutoAiConsentState(NOW + 40).decision).toBe('manual')
    })

    it('ensures a fresh scope for missing or expired local-import records', () => {
      expect(getAutoAiConsentState(NOW)).toEqual({
        source: 'local',
        decision: 'pending',
        importId: null,
      })

      const recovered = ensureLocalImportAiConsent(NOW)
      expect(recovered).toMatchObject({ decision: 'pending', startedAt: NOW, version: 1 })
      expect(recovered?.importId).toMatch(/^local-/)
      expect(getAutoAiConsentState(NOW).importId).toBe(recovered?.importId)
      expect(ensureLocalImportAiConsent(NOW)).toEqual(recovered)

      const oldId = recovered!.importId
      recordLocalImportAiDecision(oldId, 'auto', NOW + 1)
      const rotated = ensureLocalImportAiConsent(NOW + LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS)
      expect(rotated).toMatchObject({ decision: 'pending' })
      expect(rotated?.importId).not.toBe(oldId)
      expect(canAutoRunAi(getAutoAiConsentState(
        NOW + LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS,
      ))).toBe(false)
    })

    it('clears the scope back to fail-closed pending', () => {
      startLocalImportAiConsent('import-a', NOW)
      markLocalImportAiConsentReady('import-a', NOW)
      recordLocalImportAiDecision('import-a', 'auto', NOW + 10)

      clearLocalImportAiConsent()

      expect(sessionStorage.getItem(LOCAL_IMPORT_AI_CONSENT_KEY)).toBeNull()
      expect(getAutoAiConsentState(NOW + 10)).toEqual({
        source: 'local',
        decision: 'pending',
        importId: null,
      })
    })

    it('fails closed at 12 hours and rejects corrupt, unsupported, or future records', () => {
      startLocalImportAiConsent('import-a', NOW)
      markLocalImportAiConsentReady('import-a', NOW)
      recordLocalImportAiDecision('import-a', 'auto', NOW + 1)
      expect(getLocalImportAiConsent(NOW + LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS - 1)?.decision)
        .toBe('auto')
      expect(getLocalImportAiConsent(NOW + LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS)).toBeNull()

      for (const invalid of [
        '{bad json',
        JSON.stringify({ importId: 'a', decision: 'auto', startedAt: NOW, version: 2 }),
        JSON.stringify({ importId: 'a', decision: 'auto', startedAt: NOW + 1, decidedAt: NOW + 1, version: 1 }),
        JSON.stringify({ importId: 'a', decision: 'auto', startedAt: NOW, version: 1 }),
      ]) {
        sessionStorage.setItem(LOCAL_IMPORT_AI_CONSENT_KEY, invalid)
        expect(getLocalImportAiConsent(NOW)).toBeNull()
        expect(getAutoAiConsentState(NOW).decision).toBe('pending')
      }
    })
  })

  it('keeps demo authorization separate from both real-data decisions', () => {
    hasLocalData.mockReturnValue(true)
    localStorage.setItem(DEMO_FLAG_KEY, '1')
    recordAutoAiRealDataDecision('auto')

    const state = getAutoAiConsentState(NOW + 1)
    expect(state).toEqual({ source: 'demo', decision: null, importId: null })
    expect(canAutoRunAi(state)).toBe(true)
    expect(ensureLocalImportAiConsent(NOW + 1)).toBeNull()
  })

  it('locks demo auto-runs immediately when a real local import starts', () => {
    hasLocalData.mockReturnValue(true)
    localStorage.setItem(DEMO_FLAG_KEY, '1')

    startLocalImportAiConsent('real-import', NOW)

    const preparing = getAutoAiConsentState(NOW)
    expect(preparing).toEqual({
      source: 'local',
      decision: 'preparing',
      importId: 'real-import',
    })
    expect(canAutoRunAi(preparing)).toBe(false)
  })

  it('keeps a live SMART context authoritative over a preparing local upload', () => {
    hasLocalData.mockReturnValue(true)
    sessionStorage.setItem('SMART_KEY', '"smart-state"')
    sessionStorage.setItem('smart-state', JSON.stringify({
      tokenResponse: { access_token: 'token' },
    }))
    recordAutoAiRealDataDecision('manual')

    startLocalImportAiConsent('background-local-import', NOW)

    expect(getAutoAiConsentState(NOW)).toEqual({
      source: 'other',
      decision: 'manual',
      importId: null,
    })
  })

  it('keeps local decisions separate from the persisted SMART preference', () => {
    hasLocalData.mockReturnValue(true)
    recordAutoAiRealDataDecision('manual')
    startLocalImportAiConsent('import-a', NOW)
    markLocalImportAiConsentReady('import-a', NOW)
    recordLocalImportAiDecision('import-a', 'auto', NOW + 1)

    expect(isAutoAiEnabledForSource(false, getAutoAiConsentState(NOW + 1))).toBe(true)
    hasLocalData.mockReturnValue(false)
    expect(isAutoAiEnabledForSource(true, getAutoAiConsentState(NOW + 1))).toBe(false)
    expect(getAutoAiRealDataDecision()).toBe('manual')
  })

  it('rejects a cloned receipt when the encrypted Bundle has another import id', () => {
    hasLocalData.mockReturnValue(true)
    localStorage.setItem('fhir_bundle_override', 'import:bundle-a')
    startLocalImportAiConsent('bundle-a', NOW)
    markLocalImportAiConsentReady('bundle-a', NOW)
    recordLocalImportAiDecision('bundle-a', 'auto', NOW + 1)
    expect(canAutoRunAi(getAutoAiConsentState(NOW + 1))).toBe(true)

    // Simulates another tab replacing the origin-wide IndexedDB/marker while
    // this tab retained a cloned A:auto receipt in sessionStorage.
    localStorage.setItem('fhir_bundle_override', 'import:bundle-b')

    expect(getAutoAiConsentState(NOW + 2)).toEqual({
      source: 'local',
      decision: 'pending',
      importId: null,
    })
    expect(canAutoRunAi(getAutoAiConsentState(NOW + 2))).toBe(false)
    expect(ensureLocalImportAiConsent(NOW + 2)).toMatchObject({
      importId: 'bundle-b',
      decision: 'pending',
    })
  })

  it('binds the demo marker to the active Bundle id', () => {
    hasLocalData.mockReturnValue(true)
    localStorage.setItem('fhir_bundle_override', 'import:real-a')
    localStorage.setItem(DEMO_FLAG_KEY, 'demo-b')
    expect(getAutoAiConsentState(NOW).source).toBe('local')

    localStorage.setItem(DEMO_FLAG_KEY, 'real-a')
    expect(getAutoAiConsentState(NOW).source).toBe('demo')
  })

  describe('useAutoAiConsentState', () => {
    it('reacts to same-window consent writes', () => {
      hasLocalData.mockReturnValue(true)
      const { result } = renderHook(() => useAutoAiConsentState())
      expect(result.current).toEqual({ source: 'local', decision: 'pending', importId: null })

      act(() => { startLocalImportAiConsent('import-a', NOW) })
      expect(result.current).toEqual({ source: 'local', decision: 'preparing', importId: 'import-a' })

      act(() => { markLocalImportAiConsentReady('import-a', NOW) })
      expect(result.current).toEqual({ source: 'local', decision: 'pending', importId: 'import-a' })

      act(() => { recordLocalImportAiDecision('import-a', 'manual', NOW) })
      expect(result.current).toEqual({ source: 'local', decision: 'manual', importId: 'import-a' })
    })

    it('reacts to storage and Bundle source-change events', () => {
      const { result } = renderHook(() => useAutoAiConsentState())
      expect(result.current.source).toBe('other')

      act(() => {
        localStorage.setItem(AUTO_AI_REAL_DATA_DECISION_KEY, 'auto')
        window.dispatchEvent(new StorageEvent('storage', {
          key: AUTO_AI_REAL_DATA_DECISION_KEY,
          newValue: 'auto',
        }))
      })
      expect(result.current.decision).toBe('auto')

      act(() => {
        hasLocalData.mockReturnValue(true)
        window.dispatchEvent(new Event(BUNDLE_CHANGED_EVENT))
      })
      expect(result.current).toEqual({ source: 'local', decision: 'pending', importId: null })
    })

    it('becomes pending when the mounted local record reaches its 12-hour limit', () => {
      jest.restoreAllMocks()
      jest.useFakeTimers()
      jest.setSystemTime(NOW)
      jest.spyOn(LocalBundleService, 'hasData').mockReturnValue(true)
      startLocalImportAiConsent('import-a')
      markLocalImportAiConsentReady('import-a')
      recordLocalImportAiDecision('import-a', 'auto')
      const { result } = renderHook(() => useAutoAiConsentState())
      expect(result.current.decision).toBe('auto')

      act(() => { jest.advanceTimersByTime(LOCAL_IMPORT_AI_CONSENT_MAX_AGE_MS) })

      expect(result.current).toEqual({ source: 'local', decision: 'pending', importId: null })
    })
  })
})
