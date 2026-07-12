import { act, renderHook, waitFor } from '@testing-library/react'
import { createAiResultStore } from '@/src/application/hooks/ai-generation/create-ai-result-store'
import { useAiSlotGeneration } from '@/src/application/hooks/ai-generation/use-ai-slot-generation.hook'
import { BUNDLE_CHANGED_EVENT } from '@/src/shared/utils/reset-on-bundle-change'

let mockPatientId = 'demo-patient-1'
let mockClinicalData: Record<string, unknown> = { isLoading: false, error: null, catalogReady: true }
let mockCachedResult: { headline: string } | null = null

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: { id: mockPatientId } }),
}))
jest.mock('@/src/application/hooks/use-clinical-context.hook', () => ({
  useClinicalContext: () => ({
    getFullClinicalContext: () => 'demo context',
    includedDocumentIds: [],
  }),
}))
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockClinicalData,
}))
jest.mock('@/src/application/hooks/ai/use-unified-ai.hook', () => ({
  useUnifiedAi: () => ({}),
}))
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
  loadEncryptedCache: jest.fn(async () => mockCachedResult),
}))
jest.mock('@/src/core/use-cases/medical-summary/generate-medical-summary.use-case', () => ({
  getSourceCatalog: (input: { catalogReady?: boolean }) => input.catalogReady === false
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
    mockClinicalData = { isLoading: false, error: null, catalogReady: true }
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
    mockClinicalData = { isLoading: false, error: null, catalogReady: false }
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

    mockClinicalData = { isLoading: false, error: null, catalogReady: true }
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
    mockClinicalData = { isLoading: false, error: null, bundle: 'demo' }
    rerender()

    await waitFor(() => {
      expect(result.current.result).toEqual({ headline: 'pre-generated demo result' })
    })
    expect(run).not.toHaveBeenCalled()
  })
})
