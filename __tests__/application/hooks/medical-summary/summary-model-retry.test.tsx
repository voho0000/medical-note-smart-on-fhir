/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { useMedicalSummary } from '@/src/application/hooks/medical-summary/use-medical-summary.hook'
import { medicalSummaryStore } from '@/src/application/hooks/medical-summary/medical-summary-store'
import { createModelExecution, reportModelExecution, modelExecutionFallback } from '@/src/shared/utils/ai-model-execution'
import { useAiExecutionDiagnosticsStore } from '@/src/application/stores/ai-execution-diagnostics.store'

let mockSlotOptions: any
let mockResult: any
const mockStream = jest.fn()
const mockGenerate = async () => {
  mockResult = await mockSlotOptions.run({
    operationKey: 'audit-slot', modelId: 'gemini-3.8-flash', requestedModelId: 'gemini-3.8-flash',
    modelName: 'Gemini 3.8 Flash', locale: 'zh-TW', audience: 'medical',
    clinicalContext: 'synthetic data', catalog: [], piiLiterals: [], contextLimit: 10000,
    ai: { stream: mockStream },
  })
}

jest.mock('@/src/application/hooks/ai-generation/use-ai-slot-generation.hook', () => ({
  useAiSlotGeneration: (options: any) => {
    mockSlotOptions = options
    return { slotKey: 'audit-slot', catalog: [], dataReady: false, generate: mockGenerate }
  },
}))
jest.mock('@/src/application/providers/audience.provider', () => ({ useAudience: () => ({ audience: 'medical' }) }))
jest.mock('@/src/application/providers/ai-demographics-gate.provider', () => ({ useAiDemographicsGate: () => ({ demographicsReadyForAi: true }) }))
jest.mock('@/src/core/use-cases/medical-summary/generate-medical-summary.use-case', () => ({
  MEDICAL_SUMMARY_MODEL_ID: 'gemini-3.8-flash',
  generateMedicalSummaryUseCase: {
    createAiDraftFromResult: (base: any) => ({ ...base }),
    finalizeResult: (summary: any) => summary,
  },
}))
jest.mock('@/src/core/use-cases/medical-summary/medical-summary-card-registry', () => {
  const card = {
    id: 'medications', hasCompleteBatchBlock: () => true, parseBatch: () => 'NEW_MEDICATION_CARD',
    apply: (aggregate: any, parsed: any) => ({ ...aggregate, summary: { ...aggregate.summary, medications: parsed } }),
  }
  return { MEDICAL_SUMMARY_CARD_REGISTRY: { medications: card }, registeredMedicalSummaryCards: () => [card] }
})
jest.mock('@/src/application/hooks/ai-generation/context-window-retry', () => ({
  runWithContextWindowRetry: async (options: any) => ({ value: await options.execute([]), clinicalContext: 'synthetic data' }),
}))

beforeEach(() => {
  mockResult = undefined
  mockStream.mockReset()
  mockStream.mockImplementation(async (_messages, options) => {
    options.onChunk('NEW_MEDICATION_CARD')
    // Some providers report identity only in their last chunk.
    options.onModelExecution(reportModelExecution(createModelExecution('gemini-3.8-flash'), 'gemini-3.8-flash'))
    return 'NEW_MEDICATION_CARD'
  })
})

afterEach(() => jest.restoreAllMocks())

test('retrying failed cards retains provenance for successful cards kept from the previous run', async () => {
  const clear = jest.spyOn(useAiExecutionDiagnosticsStore.getState(), 'clearOperationFeature')
  const previousExecution = reportModelExecution(createModelExecution('gemini-3.8-flash'), 'gemini-3.1-flash-lite')
  medicalSummaryStore.setState({ byKey: { 'audit-slot': {
    problems: 'RETAINED_LITE_CARD', cardErrors: { medications: 'PARSE_FAILED' },
    completedCardIds: ['problems'],
    generation: { source: 'live', modelId: 'gemini-3.8-flash', modelName: 'Gemini 3.1 Flash-Lite',
      generatedAt: 1, modelExecution: previousExecution },
  } as any } })
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => result.current.retryFailedModules())
  expect(mockResult.problems).toBe('RETAINED_LITE_CARD')
  expect(mockResult.medications).toBe('NEW_MEDICATION_CARD')
  expect(mockResult.generation.modelExecution.actualModelIds).toContain('gemini-3.1-flash-lite')
  expect(modelExecutionFallback(mockResult.generation.modelExecution)).toBe(true)
  expect(mockResult.generation.cardModelExecutions.problems.actualModelId).toBe('gemini-3.1-flash-lite')
  expect(mockResult.generation.cardModelExecutions.medications.actualModelId).toBe('gemini-3.8-flash')
  expect(mockResult.generation.modelExecution.hasUnreportedSteps).not.toBe(true)
  expect(clear).not.toHaveBeenCalled()
  await act(async () => result.current.generate())
  expect(mockResult.generation.modelExecution.actualModelIds).toEqual(['gemini-3.8-flash'])
  expect(modelExecutionFallback(mockResult.generation.modelExecution)).toBe(false)
  expect(clear).toHaveBeenCalledWith('audit-slot', 'medical-summary')
})

test('replaces only the retried card provenance instead of retaining an obsolete aggregate fallback', async () => {
  const flash = reportModelExecution(createModelExecution('gemini-3.8-flash'), 'gemini-3.8-flash')
  const lite = reportModelExecution(createModelExecution('gemini-3.8-flash'), 'gemini-3.1-flash-lite')
  medicalSummaryStore.setState({ byKey: { 'audit-slot': {
    problems: 'RETAINED_FLASH_CARD', cardErrors: { medications: 'PARSE_FAILED' }, completedCardIds: ['problems'],
    generation: { source: 'live', modelId: 'gemini-3.8-flash', modelName: 'Gemini 3.1 Flash-Lite', generatedAt: 1,
      modelExecution: lite, cardModelExecutions: { problems: flash, medications: lite } },
  } as any } })
  const { result } = renderHook(() => useMedicalSummary())
  await act(async () => result.current.retryFailedModules())
  expect(mockResult.problems).toBe('RETAINED_FLASH_CARD')
  expect(mockResult.generation.modelExecution.actualModelIds).toEqual(['gemini-3.8-flash'])
  expect(modelExecutionFallback(mockResult.generation.modelExecution)).toBe(false)
})
