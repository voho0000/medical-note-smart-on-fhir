import { useAiExecutionDiagnosticsStore } from '@/src/application/stores/ai-execution-diagnostics.store'
import { aiExecutionDiagnosticsFilename } from '@/src/shared/utils/ai-execution-diagnostics'

describe('AI execution diagnostics', () => {
  beforeEach(() => {
    useAiExecutionDiagnosticsStore.getState().clearAll()
  })

  it('creates a filesystem-safe export filename', () => {
    expect(aiExecutionDiagnosticsFilename('2026-08-05T02:51:53.866Z')).toBe(
      'mediprisma-ai-diagnostics_2026-08-05_02-51-53-866.json',
    )
  })

  it('clears only records belonging to the requested operation', () => {
    const base = {
      version: 1 as const,
      feature: 'medical-summary',
      transport: 'stream' as const,
      modelName: 'Gemini',
      modelId: 'gemini',
      timestamp: '2026-08-05T02:51:53.866Z',
      prompt: 'prompt',
      inputData: {},
      outputData: 'output',
      hasError: false,
      errorMessage: null,
      status: 'completed' as const,
    }
    const store = useAiExecutionDiagnosticsStore.getState()
    store.addRecord({ ...base, id: 'one', operationKey: 'summary-slot' })
    store.addRecord({ ...base, id: 'two', operationKey: 'safety-slot' })

    useAiExecutionDiagnosticsStore.getState().clearOperation('summary-slot')

    expect(useAiExecutionDiagnosticsStore.getState().records.map(({ id }) => id)).toEqual(['two'])
  })
})
