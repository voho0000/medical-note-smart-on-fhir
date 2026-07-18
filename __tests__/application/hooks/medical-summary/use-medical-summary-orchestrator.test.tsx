import { act, renderHook, waitFor } from '@testing-library/react'
import { useMedicalSummaryOrchestrator } from '@/src/application/hooks/medical-summary/use-medical-summary-orchestrator.hook'
import { useMedicalSummary } from '@/src/application/hooks/medical-summary/use-medical-summary.hook'
import { useSafetyAlerts } from '@/src/application/hooks/safety-alerts/use-safety-alerts.hook'
import { CUSTOM_OPENAI_MODEL_ID } from '@/src/shared/constants/ai-models.constants'

let mockAutoAiConsent = {
  source: 'other' as 'other' | 'local' | 'demo',
  decision: null as 'preparing' | 'pending' | 'auto' | 'manual' | null,
  importId: null as string | null,
}
const mockStartLocalImportAiConsent = jest.fn()
const mockMarkLocalImportAiConsentReady = jest.fn((_importId: string) => true)
const mockRecordLocalImportAiDecision = jest.fn((
  _importId: string,
  _decision: 'auto' | 'manual',
) => true)
const mockRecordAutoAiRealDataDecision = jest.fn()

jest.mock('@/src/application/hooks/medical-summary/use-medical-summary.hook', () => ({
  useMedicalSummary: jest.fn(),
}))
jest.mock('@/src/application/hooks/safety-alerts/use-safety-alerts.hook', () => ({
  useSafetyAlerts: jest.fn(),
}))
jest.mock('@/src/application/hooks/ai-generation/auto-ai-consent', () => ({
  useAutoAiConsentState: () => mockAutoAiConsent,
  startLocalImportAiConsent: (importId: string) => mockStartLocalImportAiConsent(importId),
  markLocalImportAiConsentReady: (importId: string) => (
    mockMarkLocalImportAiConsentReady(importId)
  ),
  recordLocalImportAiDecision: (importId: string, decision: 'auto' | 'manual') => (
    mockRecordLocalImportAiDecision(importId, decision)
  ),
  recordAutoAiRealDataDecision: (decision: 'auto' | 'manual') => (
    mockRecordAutoAiRealDataDecision(decision)
  ),
}))

const mockUseMedicalSummary = useMedicalSummary as jest.MockedFunction<typeof useMedicalSummary>
const mockUseSafetyAlerts = useSafetyAlerts as jest.MockedFunction<typeof useSafetyAlerts>

const summaryGenerate = jest.fn(async () => {})
const safetyGenerate = jest.fn(async () => {})
const setSummaryModel = jest.fn()
const setSafetyModel = jest.fn()
const setSummaryAuto = jest.fn()
const setSafetyAuto = jest.fn()

interface ArrangeOptions {
  summaryResult?: unknown
  safetyResult?: unknown
  summaryError?: string | null
  safetyError?: string | null
  summaryHydrated?: boolean
  safetyHydrated?: boolean
  summaryGenerating?: boolean
  safetyGenerating?: boolean
  summaryModel?: string
  safetyModel?: string
  summaryAuto?: boolean
  safetyAuto?: boolean
}

function arrange({
  summaryResult = { headline: 'summary' },
  safetyResult = { alerts: [] },
  summaryError = null,
  safetyError = null,
  summaryHydrated = true,
  safetyHydrated = true,
  summaryGenerating = false,
  safetyGenerating = false,
  summaryModel = 'gemini-3.1-flash-lite',
  safetyModel = 'gemini-3.1-flash-lite',
  summaryAuto = true,
  safetyAuto = true,
}: ArrangeOptions = {}) {
  mockUseMedicalSummary.mockReturnValue({
    result: summaryResult as never,
    coverage: null,
    isGenerating: summaryGenerating,
    error: summaryError,
    hasPatient: true,
    dataReady: true,
    isHydrated: summaryHydrated,
    autoGenerate: summaryAuto,
    setAutoGenerate: setSummaryAuto,
    model: summaryModel,
    setModel: setSummaryModel,
    generate: summaryGenerate,
  })
  mockUseSafetyAlerts.mockReturnValue({
    result: safetyResult as never,
    isScanning: safetyGenerating,
    error: safetyError,
    hasPatient: true,
    isHydrated: safetyHydrated,
    autoScan: safetyAuto,
    setAutoScan: setSafetyAuto,
    model: safetyModel,
    setModel: setSafetyModel,
    scan: safetyGenerate,
    resolveSource: jest.fn(),
  })
}

describe('useMedicalSummaryOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStartLocalImportAiConsent.mockImplementation((importId: string) => ({ importId }))
    mockAutoAiConsent = { source: 'other', decision: null, importId: null }
    arrange()
  })

  it('runs summary and safety as one user-facing generation action', async () => {
    const { result } = renderHook(() => useMedicalSummaryOrchestrator())
    await act(async () => result.current.generate())
    expect(summaryGenerate).toHaveBeenCalledTimes(1)
    expect(safetyGenerate).toHaveBeenCalledTimes(1)
  })

  it('runs local summary and safety requests sequentially', async () => {
    const order: string[] = []
    summaryGenerate.mockImplementationOnce(async () => {
      order.push('summary:start')
      await Promise.resolve()
      order.push('summary:end')
    })
    safetyGenerate.mockImplementationOnce(async () => {
      order.push('safety:start')
      await Promise.resolve()
      order.push('safety:end')
    })
    arrange({
      summaryModel: CUSTOM_OPENAI_MODEL_ID,
      safetyModel: CUSTOM_OPENAI_MODEL_ID,
    })

    const { result } = renderHook(() => useMedicalSummaryOrchestrator())
    await act(async () => result.current.generate())

    expect(order).toEqual([
      'summary:start',
      'summary:end',
      'safety:start',
      'safety:end',
    ])
  })

  it('retries only the failed pipeline', async () => {
    arrange({ summaryError: 'failed' })
    const { result } = renderHook(() => useMedicalSummaryOrchestrator())
    await act(async () => result.current.retryFailed())
    expect(summaryGenerate).toHaveBeenCalledTimes(1)
    expect(safetyGenerate).not.toHaveBeenCalled()
  })

  it('waits for both audience cache slots before presenting the summary', () => {
    arrange({ safetyHydrated: false })
    const { result } = renderHook(() => useMedicalSummaryOrchestrator())
    expect(result.current.isRestoring).toBe(true)
  })

  it('migrates historical safety preferences to the summary controls', async () => {
    arrange({ safetyModel: 'old-model', safetyAuto: false })
    renderHook(() => useMedicalSummaryOrchestrator())
    await waitFor(() => {
      expect(setSafetyModel).toHaveBeenCalledWith('gemini-3.1-flash-lite')
      expect(setSafetyAuto).toHaveBeenCalledWith(true)
    })
  })

  it('reopens import-scoped consent instead of immediately enabling local auto-run', () => {
    mockAutoAiConsent = { source: 'local', decision: 'manual', importId: 'import-a' }
    arrange({ summaryAuto: false, safetyAuto: false })
    const { result } = renderHook(() => useMedicalSummaryOrchestrator())

    act(() => result.current.setAutoGenerate(true))

    expect(mockStartLocalImportAiConsent).toHaveBeenCalledWith('import-a')
    expect(mockMarkLocalImportAiConsentReady).toHaveBeenCalledWith('import-a')
    expect(setSummaryAuto).not.toHaveBeenCalled()
    expect(setSafetyAuto).not.toHaveBeenCalled()
  })

  it('ignores the previous patient controls while a new Bundle is preparing', () => {
    mockAutoAiConsent = { source: 'local', decision: 'preparing', importId: 'import-b' }
    const { result } = renderHook(() => useMedicalSummaryOrchestrator())

    act(() => result.current.setAutoGenerate(true))

    expect(mockStartLocalImportAiConsent).not.toHaveBeenCalled()
    expect(mockMarkLocalImportAiConsentReady).not.toHaveBeenCalled()
    expect(mockRecordLocalImportAiDecision).not.toHaveBeenCalled()
    expect(setSummaryAuto).not.toHaveBeenCalled()
    expect(setSafetyAuto).not.toHaveBeenCalled()
  })

  it('records the safe local choice when automatic generation is turned off', () => {
    mockAutoAiConsent = { source: 'local', decision: 'auto', importId: 'import-a' }
    const { result } = renderHook(() => useMedicalSummaryOrchestrator())
    expect(result.current.autoGenerate).toBe(true)

    act(() => result.current.setAutoGenerate(false))

    expect(mockRecordLocalImportAiDecision).toHaveBeenCalledWith('import-a', 'manual')
    expect(setSummaryAuto).not.toHaveBeenCalled()
    expect(setSafetyAuto).not.toHaveBeenCalled()
  })

  it('publishes refreshed summary and safety results together after a batch settles', async () => {
    const oldSummary = { headline: 'old summary' }
    const oldSafety = { alerts: [{ id: 'old' }] }
    arrange({ summaryResult: oldSummary, safetyResult: oldSafety, summaryGenerating: true })
    const { result, rerender } = renderHook(() => useMedicalSummaryOrchestrator())
    await waitFor(() => expect(result.current.activeBatchId).not.toBeNull())

    arrange({
      summaryResult: { headline: 'new summary' },
      safetyResult: { alerts: [{ id: 'new' }] },
      summaryGenerating: true,
    })
    rerender()
    expect(result.current.result).toEqual(oldSummary)
    expect(result.current.safetyResult).toEqual(oldSafety)

    arrange({
      summaryResult: { headline: 'new summary' },
      safetyResult: { alerts: [{ id: 'new' }] },
    })
    rerender()
    await waitFor(() => expect(result.current.activeBatchId).toBeNull())
    expect(result.current.result).toEqual({ headline: 'new summary' })
    expect(result.current.safetyResult).toEqual({ alerts: [{ id: 'new' }] })
  })
})
