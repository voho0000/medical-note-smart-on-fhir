/**
 * @jest-environment-options {"url": "https://mediprisma.tw/"}
 */
// Usage-analytics adapter — the allowlist IS the privacy boundary, so these
// tests are about what does NOT get sent as much as what does.
//
// jsdom's `window.location` is non-configurable, so the enabled hostname comes
// from the docblock above. The disabled-hostname case needs a different origin
// and therefore lives in usage-analytics-disabled.test.ts.

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

type AdapterModule = typeof import('@/src/infrastructure/telemetry/usage-analytics')
/** Loose view of the API so the allowlist can be probed with invalid input. */
type LooseTrack = (name: string, params: Record<string, unknown>) => void
type LooseProps = (props: Record<string, unknown>) => void

/** setUserProperties calls that came from a CALLER — the adapter sets
 *  `browser_id` on its own during loadSdk, which is not what these assert. */
function callerPropCalls(): Array<Record<string, unknown>> {
  return mockSetUserProperties.mock.calls
    .map(([, props]) => props as Record<string, unknown>)
    .filter((props) => !('browser_id' in props))
}

let idleCallbacks: Array<() => void> = []

async function loadAdapter(): Promise<AdapterModule> {
  jest.resetModules()
  return import('@/src/infrastructure/telemetry/usage-analytics')
}

/** Run the queued idle callback and let the dynamic import / isSupported settle. */
async function runIdleAndSettle(): Promise<void> {
  const pending = idleCallbacks
  idleCallbacks = []
  for (const cb of pending) cb()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('usage-analytics adapter', () => {
  const originalMeasurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  const originalEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = 'G-TEST'
    delete process.env.NEXT_PUBLIC_FIREBASE_EMULATOR
    mockLogEvent.mockClear()
    mockSetUserProperties.mockClear()
    mockInitializeAnalytics.mockClear()
    mockIsSupported.mockClear()
    idleCallbacks = []
    localStorage.clear()
    ;(window as unknown as { requestIdleCallback: (cb: () => void) => number })
      .requestIdleCallback = (cb: () => void) => {
        idleCallbacks.push(cb)
        return 1
      }
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
    if (originalMeasurementId === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
    else process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = originalMeasurementId
    if (originalEmulator === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_EMULATOR
    else process.env.NEXT_PUBLIC_FIREBASE_EMULATOR = originalEmulator
  })

  describe('allowlist', () => {
    it('drops an unknown event name', async () => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('prompt_text', { area: 'left' })
      await runIdleAndSettle()
      expect(mockInitializeAnalytics).not.toHaveBeenCalled()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('drops the whole event when a param key is not allowlisted', async () => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('view_open', {
        area: 'left',
        id: 'patient',
        trigger: 'user',
        // The exact shape a future careless caller might add.
        patient_name: '王小明',
      })
      await runIdleAndSettle()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('drops the event when a free-text value exceeds 64 characters', async () => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('view_open', {
        area: 'left',
        id: 'x'.repeat(65),
        trigger: 'auto',
      })
      await runIdleAndSettle()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('drops the event when an enum param carries an unlisted value', async () => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('view_open', {
        area: 'timeline',
        id: 'patient',
        trigger: 'user',
      })
      await runIdleAndSettle()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('accepts the launch event with its workstation code', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('app_launch', {
        launch_source: 'medcloud2',
        site: 'vghtpe',
        workstation: 'OPD-3F-01',
      })
      await runIdleAndSettle()
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'app_launch', {
        launch_source: 'medcloud2',
        site: 'vghtpe',
        workstation: 'OPD-3F-01',
      })
    })

    it('accepts a fully valid event', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('chat_send', {
        source: 'chip',
        has_image: true,
        model_id: 'gemini-2.5-flash',
        agent_mode: false,
      })
      await runIdleAndSettle()
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'chat_send', {
        source: 'chip',
        has_image: true,
        model_id: 'gemini-2.5-flash',
        agent_mode: false,
      })
    })
  })

  // The count parameters are the only ones sent as EXACT numbers, so the
  // integer/non-negative rule is the entire guarantee that what arrives in GA4
  // is a countable quantity and not some other measurement that happened to be
  // a number. They ride on `ai_result` and nowhere else — chart volume is
  // recorded only when the chart is actually given to a model.
  describe('count parameters', () => {
    const counts = {
      resource_count: 1284,
      obs_count: 903,
      med_count: 61,
      doc_count: 42,
      encounter_count: 77,
      report_count: 118,
    }
    const base = {
      surface: 'summary',
      outcome: 'ok',
      model_id: 'gemini-2.5-flash',
      duration_bucket: '5to15',
    } as const

    it('accepts a full set of exact counts alongside the outcome', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('ai_result', { ...base, ...counts })
      await runIdleAndSettle()
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'ai_result', {
        ...base,
        ...counts,
      })
    })

    it('accepts zero — an empty chart is a real, reportable measurement', async () => {
      const mod = await loadAdapter()
      const zeros = {
        resource_count: 0,
        obs_count: 0,
        med_count: 0,
        doc_count: 0,
        encounter_count: 0,
        report_count: 0,
      }
      mod.trackEvent('ai_result', { ...base, ...zeros })
      await runIdleAndSettle()
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'ai_result', {
        ...base,
        ...zeros,
      })
    })

    it('reports the outcome alone when no chart is loaded', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('ai_result', base)
      await runIdleAndSettle()
      // Absent, not zero: "nothing loaded" must not look like "loaded, empty".
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'ai_result', base)
    })

    it('drops the event on a negative count', async () => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('ai_result', {
        ...base,
        ...counts,
        obs_count: -1,
      })
      await runIdleAndSettle()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('drops the event on a non-integer count', async () => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('ai_result', {
        ...base,
        ...counts,
        med_count: 3.5,
      })
      await runIdleAndSettle()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it.each([
      ['a numeric string', '12'],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['null', null],
    ])('drops the event when a count is %s', async (_label, value) => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('ai_result', {
        ...base,
        ...counts,
        doc_count: value,
      })
      await runIdleAndSettle()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('carries the loaded totals and the fed counts on one event', async () => {
      const mod = await loadAdapter()
      const fed = {
        fed_resource_count: 190,
        fed_obs_count: 120,
        fed_med_count: 20,
        fed_doc_count: 8,
        fed_encounter_count: 12,
        fed_report_count: 30,
      }
      mod.trackEvent('ai_result', { ...base, ...counts, ...fed })
      await runIdleAndSettle()
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'ai_result', {
        ...base,
        ...counts,
        ...fed,
      })
    })

    it('accepts a partial fed set', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('ai_result', {
        ...base,
        surface: 'report_interp',
        fed_resource_count: 1,
        fed_report_count: 1,
      })
      await runIdleAndSettle()
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'ai_result', {
        ...base,
        surface: 'report_interp',
        fed_resource_count: 1,
        fed_report_count: 1,
      })
    })

    it('holds a fed count to the same integer rule', async () => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('ai_result', {
        ...base,
        fed_obs_count: -3,
      })
      await runIdleAndSettle()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('carries context_tokens on ai_result when the surface has an estimate', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('ai_result', {
        surface: 'summary',
        outcome: 'ok',
        model_id: 'gemini-2.5-flash',
        duration_bucket: '5to15',
        context_tokens: 18_432,
      })
      await runIdleAndSettle()
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'ai_result', {
        surface: 'summary',
        outcome: 'ok',
        model_id: 'gemini-2.5-flash',
        duration_bucket: '5to15',
        context_tokens: 18_432,
      })
    })

    it('keeps the rest of ai_result when context_tokens is spread in as undefined', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('ai_result', {
        surface: 'chat',
        outcome: 'ok',
        model_id: 'gemini-2.5-flash',
        duration_bucket: 'lt5',
        context_tokens: undefined,
      })
      await runIdleAndSettle()
      // An optional parameter left unset is an ABSENT parameter, not a
      // malformed one — the event must still be reported, without the key.
      expect(mockLogEvent).toHaveBeenCalledWith(expect.anything(), 'ai_result', {
        surface: 'chat',
        outcome: 'ok',
        model_id: 'gemini-2.5-flash',
        duration_bucket: 'lt5',
      })
    })

    it('still drops ai_result when context_tokens is present but not a count', async () => {
      const mod = await loadAdapter()
      ;(mod.trackEvent as unknown as LooseTrack)('ai_result', {
        surface: 'chat',
        outcome: 'ok',
        model_id: 'gemini-2.5-flash',
        duration_bucket: 'lt5',
        context_tokens: -4,
      })
      await runIdleAndSettle()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })
  })

  describe('enable gate', () => {
    it('never loads the SDK without a measurement id', async () => {
      delete process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'all' })
      await runIdleAndSettle()
      expect(mockIsSupported).not.toHaveBeenCalled()
      expect(mockInitializeAnalytics).not.toHaveBeenCalled()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('never loads the SDK against the Firebase emulator', async () => {
      process.env.NEXT_PUBLIC_FIREBASE_EMULATOR = '1'
      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'all' })
      await runIdleAndSettle()
      expect(mockInitializeAnalytics).not.toHaveBeenCalled()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })

    it('exposes the production hostnames as a single constant', async () => {
      const mod = await loadAdapter()
      expect(mod.ANALYTICS_HOSTNAME_ALLOWLIST).toEqual(['mediprisma.tw', 'voho0000.github.io'])
    })

    it('initializes with page_view, Google Signals and ad personalization off', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'labs' })
      await runIdleAndSettle()
      expect(mockInitializeAnalytics).toHaveBeenCalledWith(expect.anything(), {
        config: {
          send_page_view: false,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
        },
      })
    })
  })

  describe('queue', () => {
    it('queues events before the SDK is ready and flushes them in order', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('view_open', { area: 'left', id: 'patient', trigger: 'auto' })
      mod.trackEvent('view_open', { area: 'right', id: 'medical-chat', trigger: 'auto' })
      mod.trackEvent('handoff_copy', { mode: 'reports' })
      expect(mockLogEvent).not.toHaveBeenCalled()

      await runIdleAndSettle()

      expect(mockLogEvent).toHaveBeenCalledTimes(3)
      expect(mockLogEvent.mock.calls.map((call) => call[1])).toEqual([
        'view_open',
        'view_open',
        'handoff_copy',
      ])
      expect(mockLogEvent.mock.calls[0][2]).toEqual({
        area: 'left',
        id: 'patient',
        trigger: 'auto',
      })
    })

    it('sends immediately once the SDK is ready', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'all' })
      await runIdleAndSettle()
      mockLogEvent.mockClear()

      mod.trackEvent('handoff_copy', { mode: 'labs' })
      expect(mockLogEvent).toHaveBeenCalledTimes(1)
    })

    it('caps the queue at 50 pending items', async () => {
      const mod = await loadAdapter()
      for (let i = 0; i < 60; i += 1) {
        mod.trackEvent('view_open', { area: 'meds', id: `id-${i}`, trigger: 'auto' })
      }
      await runIdleAndSettle()
      expect(mockLogEvent).toHaveBeenCalledTimes(50)
      expect(mockLogEvent.mock.calls[49][2]).toEqual({
        area: 'meds',
        id: 'id-49',
        trigger: 'auto',
      })
    })

    it('mints no browser id when analytics is unsupported', async () => {
      mockIsSupported.mockResolvedValueOnce(false)
      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'all' })
      await runIdleAndSettle()
      expect(mockSetUserProperties).not.toHaveBeenCalled()
      expect(localStorage.getItem(mod.BROWSER_ID_STORAGE_KEY)).toBeNull()
    })

    it('drops everything when analytics is unsupported in this browser', async () => {
      mockIsSupported.mockResolvedValueOnce(false)
      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'all' })
      await runIdleAndSettle()
      expect(mockInitializeAnalytics).not.toHaveBeenCalled()
      expect(mockLogEvent).not.toHaveBeenCalled()
    })
  })

  describe('browser_id', () => {
    const HEX32 = /^[0-9a-f]{32}$/

    it('attaches a per-browser id BEFORE the first event flushes', async () => {
      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'all' })
      await runIdleAndSettle()

      expect(mockSetUserProperties).toHaveBeenCalledTimes(1)
      const [, props] = mockSetUserProperties.mock.calls[0]!
      expect((props as { browser_id: string }).browser_id).toMatch(HEX32)
      // Ordering is the whole point: an event that flushed first would be
      // recorded without the id.
      expect(mockSetUserProperties.mock.invocationCallOrder[0])
        .toBeLessThan(mockLogEvent.mock.invocationCallOrder[0])
      expect(localStorage.getItem(mod.BROWSER_ID_STORAGE_KEY))
        .toBe((props as { browser_id: string }).browser_id)
    })

    it('reuses the id a previous load stored', async () => {
      const existing = 'a'.repeat(32)
      localStorage.setItem('mediprisma.analytics.browser_id', existing)

      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'all' })
      await runIdleAndSettle()

      expect(mockSetUserProperties).toHaveBeenCalledWith(expect.anything(), {
        browser_id: existing,
      })
      expect(localStorage.getItem(mod.BROWSER_ID_STORAGE_KEY)).toBe(existing)
    })

    it('replaces a stored value that is not a 32-hex id', async () => {
      localStorage.setItem('mediprisma.analytics.browser_id', 'abc')

      const mod = await loadAdapter()
      mod.trackEvent('handoff_copy', { mode: 'all' })
      await runIdleAndSettle()

      const stored = localStorage.getItem(mod.BROWSER_ID_STORAGE_KEY)
      expect(stored).toMatch(HEX32)
      expect(stored).not.toBe('abc')
      expect(mockSetUserProperties).toHaveBeenCalledWith(expect.anything(), {
        browser_id: stored,
      })
    })

    it('keeps reporting when storage refuses the write', async () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError')
        })
      try {
        const mod = await loadAdapter()
        // A per-load id would be noise, not a machine count.
        expect(mod.getOrCreateBrowserId()).toBeNull()

        mod.trackEvent('handoff_copy', { mode: 'all' })
        await runIdleAndSettle()

        expect(mockSetUserProperties).not.toHaveBeenCalled()
        expect(mockLogEvent).toHaveBeenCalledTimes(1)
      } finally {
        setItemSpy.mockRestore()
      }
    })
  })

  describe('setUserProps', () => {
    it('sends the allowlisted properties', async () => {
      const mod = await loadAdapter()
      mod.setUserProps({ audience: 'medical', auth_kind: 'anon' })
      await runIdleAndSettle()
      expect(mockSetUserProperties).toHaveBeenCalledWith(expect.anything(), {
        audience: 'medical',
        auth_kind: 'anon',
      })
    })

    it('accepts the workstation code as a free string', async () => {
      const mod = await loadAdapter()
      mod.setUserProps({ workstation: 'OPD-3F-01' })
      await runIdleAndSettle()
      expect(mockSetUserProperties).toHaveBeenCalledWith(expect.anything(), {
        workstation: 'OPD-3F-01',
      })
    })

    it('drops the call when a key is not allowlisted', async () => {
      const mod = await loadAdapter()
      ;(mod.setUserProps as unknown as LooseProps)({ audience: 'medical', uid: 'abc123' })
      await runIdleAndSettle()
      expect(callerPropCalls()).toEqual([])
    })

    it('drops the call when a value is over-long', async () => {
      const mod = await loadAdapter()
      ;(mod.setUserProps as unknown as LooseProps)({ app_version: 'v'.repeat(65) })
      await runIdleAndSettle()
      expect(callerPropCalls()).toEqual([])
    })
  })

  describe('trigger flag', () => {
    it('returns "user" once after markUserTrigger, then "auto"', async () => {
      const mod = await loadAdapter()
      expect(mod.consumeTrigger('left')).toBe('auto')
      mod.markUserTrigger('left')
      expect(mod.consumeTrigger('left')).toBe('user')
      expect(mod.consumeTrigger('left')).toBe('auto')
    })

    it('does not let another area consume a flag marked for "left"', async () => {
      // React commits child effects first: clicking the left 報告 tab runs
      // ReportsCard's `reports` effect before LeftPanelLayout's `left` effect.
      // A shared flag would attribute the click to the child.
      const mod = await loadAdapter()
      mod.markUserTrigger('left')
      expect(mod.consumeTrigger('reports')).toBe('auto')
      expect(mod.consumeTrigger('cumulative')).toBe('auto')
      expect(mod.consumeTrigger('left')).toBe('user')
    })

    it('keeps one pending flag per area', async () => {
      const mod = await loadAdapter()
      mod.markUserTrigger('meds')
      mod.markUserTrigger('summary')
      expect(mod.consumeTrigger('summary')).toBe('user')
      expect(mod.consumeTrigger('meds')).toBe('user')
      expect(mod.consumeTrigger('meds')).toBe('auto')
    })
  })
})
