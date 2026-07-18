import { act, renderHook, waitFor } from '@testing-library/react'
import { createAiResultStore } from '@/src/application/hooks/ai-generation/create-ai-result-store'
import { useAiSlotGeneration } from '@/src/application/hooks/ai-generation/use-ai-slot-generation.hook'
import {
  BUNDLE_CHANGED_EVENT,
  BUNDLE_CHANGE_SETTLED_EVENT,
} from '@/src/shared/utils/reset-on-bundle-change'

let mockPatientId = 'demo-patient-1'
let mockClinicalContext = 'demo context'
let mockClinicalData: Record<string, unknown> = {
  isLoading: false,
  isFetching: false,
  error: null,
  encounters: [{ id: 'demo-encounter-1' }],
}
let mockCachedResult: { headline: string } | null = null

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: { id: mockPatientId } }),
}))
jest.mock('@/src/application/hooks/use-clinical-context.hook', () => ({
  useClinicalContext: () => ({
    getFullClinicalContext: () => mockClinicalContext,
    includedDocumentIds: [],
  }),
}))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockClinicalData,
}))
jest.mock('@/src/application/hooks/ai/use-unified-ai.hook', () => ({
  useUnifiedAi: () => ({ stop: () => undefined }),
}))
jest.mock('@/src/application/providers/data-selection.provider', () => {
  const constants = jest.requireActual('@/src/shared/constants/data-selection.constants')
  return {
    useDataSelection: () => ({
      getProfile: () => ({
        selection: constants.ALL_DATA_SELECTION,
        filters: constants.ALL_DATA_FILTERS,
      }),
    }),
  }
})
jest.mock('@/src/application/stores/ai-config.store', () => ({
  useAllApiKeys: () => ({ apiKey: 'user-openai-key', geminiKey: '', claudeKey: '' }),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'patient' }),
}))
jest.mock('@/src/application/providers/auth.provider', () => ({
  useAuth: () => ({ loading: false, user: { uid: 'user-1' }, isAnonymous: false }),
}))
jest.mock('@/src/infrastructure/cache/encrypted-session-cache', () => ({
  ...jest.requireActual('@/src/infrastructure/cache/encrypted-session-cache'),
  loadEncryptedCache: jest.fn(async () => mockCachedResult),
}))
jest.mock('@/src/core/use-cases/medical-summary/generate-medical-summary.use-case', () => ({
  getSourceCatalog: (input: { encounters?: unknown[] }) => !input.encounters?.length
    ? []
    : [{
        key: 'E1',
        resourceType: 'Encounter',
        resourceId: 'demo-encounter-1',
        display: 'Demo encounter',
      }],
  scopeDocumentSources: (catalog: unknown) => catalog,
}))

describe('useAiSlotGeneration demo snapshot', () => {
  beforeEach(() => {
    mockPatientId = 'demo-patient-1'
    mockClinicalContext = 'demo context'
    mockClinicalData = {
      isLoading: false,
      isFetching: false,
      error: null,
      encounters: [{ id: 'demo-encounter-1' }],
    }
    mockCachedResult = null
  })

  it('seeds the audited snapshot without calling AI when another model preference is retained', async () => {
    const store = createAiResultStore<{ headline: string }>()
    const run = jest.fn(async () => ({ headline: 'live AI result' }))
    const demoSeed = jest.fn(() => ({ headline: 'pre-generated demo result' }))

    const { result } = renderHook(() => useAiSlotGeneration({
      defaultModelId: 'gemini-3.1-flash-lite',
      selectedModelId: 'gpt-5.4-mini',
      autoRunEnabled: true,
      requireDataReadyToGenerate: true,
      store,
      cacheKeyFor: (slotKey) => `test:${slotKey}`,
      cacheMaxAgeMs: 60_000,
      run,
      demoSeed,
    }))

    await waitFor(() => {
      expect(result.current.resolvedModelId).toBe('gpt-5.4-mini')
      expect(result.current.result).toEqual({ headline: 'pre-generated demo result' })
    })
    expect(demoSeed).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
  })

  it('waits for the demo catalog instead of auto-running AI against transient empty data', async () => {
    mockClinicalData = { isLoading: false, error: null, encounters: [] }
    const store = createAiResultStore<{ headline: string }>()
    const run = jest.fn(async () => ({ headline: 'live AI result from empty data' }))
    const demoSeed = jest.fn(() => ({ headline: 'pre-generated demo result' }))

    const { result, rerender } = renderHook(() => useAiSlotGeneration({
      defaultModelId: 'gemini-3.1-flash-lite',
      selectedModelId: 'gemini-3.1-flash-lite',
      autoRunEnabled: true,
      requireDataReadyToGenerate: true,
      store,
      cacheKeyFor: (slotKey) => `test:${slotKey}`,
      cacheMaxAgeMs: 60_000,
      run,
      demoSeed,
    }))

    await waitFor(() => expect(result.current.isHydrated).toBe(true))
    expect(result.current.result).toBeUndefined()
    expect(run).not.toHaveBeenCalled()

    mockClinicalData = {
      isLoading: false,
      isFetching: false,
      error: null,
      encounters: [{ id: 'demo-encounter-1' }],
    }
    rerender()

    await waitFor(() => {
      expect(result.current.result).toEqual({ headline: 'pre-generated demo result' })
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('does not restart AI for the previous patient while a bundle switch is in progress', async () => {
    mockPatientId = 'local-patient'
    mockCachedResult = { headline: 'existing local result' }
    const store = createAiResultStore<{ headline: string }>()
    const run = jest.fn(async () => ({ headline: 'unexpected live AI result' }))
    const demoSeed = jest.fn(() => ({ headline: 'pre-generated demo result' }))

    const { result, rerender } = renderHook(() => useAiSlotGeneration({
      defaultModelId: 'gemini-3.1-flash-lite',
      selectedModelId: 'gemini-3.1-flash-lite',
      autoRunEnabled: true,
      requireDataReadyToGenerate: true,
      store,
      cacheKeyFor: (slotKey) => `test:${slotKey}`,
      cacheMaxAgeMs: 60_000,
      run,
      demoSeed,
    }))

    await waitFor(() => {
      expect(result.current.result).toEqual({ headline: 'existing local result' })
    })

    // persistBundle() dispatches this reset before React Query publishes the
    // newly imported patient/data. The old patient must not become auto-run
    // eligible in that transition window merely because its store was cleared.
    act(() => window.dispatchEvent(new Event(BUNDLE_CHANGED_EVENT)))
    expect(run).not.toHaveBeenCalled()

    mockCachedResult = null
    mockPatientId = 'demo-patient-1'
    mockClinicalData = {
      isLoading: false,
      error: null,
      encounters: [{ id: 'demo-encounter-1' }],
    }
    rerender()

    await waitFor(() => {
      expect(result.current.result).toEqual({ headline: 'pre-generated demo result' })
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('does not expose a generation slot while clinical data is background-fetching', async () => {
    mockPatientId = 'smart-patient-1'
    mockClinicalData = {
      isLoading: false,
      isFetching: true,
      error: null,
      encounters: [{ id: 'demo-encounter-1' }],
    }
    const store = createAiResultStore<{ headline: string }>()
    const run = jest.fn(async () => ({ headline: 'full-data result' }))

    const { result, rerender } = renderHook(() => useAiSlotGeneration({
      defaultModelId: 'gemini-3.1-flash-lite',
      selectedModelId: 'gemini-3.1-flash-lite',
      autoRunEnabled: true,
      requireDataReadyToGenerate: true,
      store,
      cacheKeyFor: (slotKey) => `test:${slotKey}`,
      cacheMaxAgeMs: 60_000,
      run,
    }))

    expect(result.current.dataReady).toBe(false)
    expect(result.current.slotKey).toBe('')
    expect(run).not.toHaveBeenCalled()

    mockClinicalData = {
      isLoading: false,
      isFetching: false,
      error: null,
      encounters: [{ id: 'demo-encounter-1' }],
    }
    rerender()

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    expect(result.current.dataReady).toBe(true)
    expect(result.current.slotKey).toContain('::ctx-')
  })

  it('uses a new slot and does not reuse the old result when clinical input changes', async () => {
    mockPatientId = 'smart-patient-1'
    const store = createAiResultStore<{ headline: string }>()
    const run = jest.fn(async (ctx: { clinicalContext: string }) => ({
      headline: `result for ${ctx.clinicalContext}`,
    }))

    const { result, rerender } = renderHook(() => useAiSlotGeneration({
      defaultModelId: 'gemini-3.1-flash-lite',
      selectedModelId: 'gemini-3.1-flash-lite',
      autoRunEnabled: true,
      requireDataReadyToGenerate: true,
      store,
      cacheKeyFor: (slotKey) => `test:${slotKey}`,
      cacheMaxAgeMs: 60_000,
      run,
    }))

    await waitFor(() => {
      expect(result.current.result).toEqual({ headline: 'result for demo context' })
    })
    const firstSlot = result.current.slotKey

    mockClinicalContext = 'complete visits, reports, and medications'
    rerender()

    await waitFor(() => {
      expect(result.current.result).toEqual({
        headline: 'result for complete visits, reports, and medications',
      })
    })
    expect(result.current.slotKey).not.toBe(firstSlot)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('auto-runs again when the same patient and content are re-imported', async () => {
    mockPatientId = 'smart-patient-1'
    const store = createAiResultStore<{ headline: string }>()
    let runCount = 0
    const run = jest.fn(async () => ({ headline: `result ${++runCount}` }))

    const { result } = renderHook(() => useAiSlotGeneration({
      defaultModelId: 'gemini-3.1-flash-lite',
      selectedModelId: 'gemini-3.1-flash-lite',
      autoRunEnabled: true,
      requireDataReadyToGenerate: true,
      store,
      cacheKeyFor: (slotKey) => `test:${slotKey}`,
      cacheMaxAgeMs: 60_000,
      run,
    }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.result).toEqual({ headline: 'result 1' }))

    act(() => {
      window.dispatchEvent(new Event(BUNDLE_CHANGED_EVENT))
      window.dispatchEvent(new Event(BUNDLE_CHANGE_SETTLED_EVENT))
    })

    await waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.result).toEqual({ headline: 'result 2' }))
  })

  it('drops a late reply from the Bundle that was replaced mid-generation', async () => {
    mockPatientId = 'smart-patient-1'
    const store = createAiResultStore<{ headline: string }>()
    let resolveRun!: (value: { headline: string }) => void
    const run = jest.fn(() => new Promise<{ headline: string }>((resolve) => {
      resolveRun = resolve
    }))

    const { result } = renderHook(() => useAiSlotGeneration({
      defaultModelId: 'gemini-3.1-flash-lite',
      selectedModelId: 'gemini-3.1-flash-lite',
      autoRunEnabled: true,
      requireDataReadyToGenerate: true,
      store,
      cacheKeyFor: (slotKey) => `test:${slotKey}`,
      cacheMaxAgeMs: 60_000,
      run,
    }))

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    act(() => window.dispatchEvent(new Event(BUNDLE_CHANGED_EVENT)))
    await act(async () => { resolveRun({ headline: 'stale patient result' }) })

    expect(result.current.result).toBeUndefined()
    expect(store.getState().byKey).toEqual({})
    expect(store.getState().running).toEqual({})
  })
})
