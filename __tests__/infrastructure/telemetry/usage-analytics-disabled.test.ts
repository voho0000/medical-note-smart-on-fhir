/**
 * @jest-environment-options {"url": "http://localhost:3001/"}
 */
// The hostname half of the enable gate. jsdom's `window.location` is
// non-configurable, so the only way to test a non-production origin is a
// separate file with its own environment URL — everything else about the
// adapter is covered in usage-analytics.test.ts.

// Module scope (no top-level import in this file).
export {}

const mockLogEvent = jest.fn()
const mockSetUserProperties = jest.fn()
const mockInitializeAnalytics = jest.fn(() => ({ app: 'test-app' }))
const mockIsSupported = jest.fn(async () => true)

jest.mock('firebase/analytics', () => ({
  logEvent: mockLogEvent,
  setUserProperties: mockSetUserProperties,
  initializeAnalytics: mockInitializeAnalytics,
  isSupported: mockIsSupported,
}))

jest.mock('@/src/shared/config/firebase.config', () => ({
  app: { name: 'test-app' },
}))

describe('usage-analytics on a non-production hostname', () => {
  it('is a silent no-op: no SDK load, no events, no user properties', async () => {
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST'
    delete process.env.NEXT_PUBLIC_FIREBASE_EMULATOR
    let idleCalled = false
    ;(window as unknown as { requestIdleCallback: (cb: () => void) => number })
      .requestIdleCallback = (cb: () => void) => {
        idleCalled = true
        cb()
        return 1
      }

    jest.resetModules()
    const mod = await import('@/src/infrastructure/telemetry/usage-analytics')
    expect(window.location.hostname).toBe('localhost')

    mod.trackEvent('view_open', { area: 'left', id: 'patient', trigger: 'auto' })
    mod.setUserProps({ audience: 'medical' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(idleCalled).toBe(false)
    // Nothing is minted or persisted off the production hostnames either.
    expect(localStorage.getItem(mod.BROWSER_ID_STORAGE_KEY)).toBeNull()
    expect(mockIsSupported).not.toHaveBeenCalled()
    expect(mockInitializeAnalytics).not.toHaveBeenCalled()
    expect(mockLogEvent).not.toHaveBeenCalled()
    expect(mockSetUserProperties).not.toHaveBeenCalled()

    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
  })
})
