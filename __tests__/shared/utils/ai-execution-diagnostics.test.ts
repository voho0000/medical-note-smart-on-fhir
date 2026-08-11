import { useAiExecutionDiagnosticsStore } from '@/src/application/stores/ai-execution-diagnostics.store'
import {
  aiExecutionDiagnosticsFilename,
  buildAiExecutionDiagnosticsExport,
  formatAiExecutionTimestamp,
} from '@/src/shared/utils/ai-execution-diagnostics'

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

describe('AI execution diagnostics', () => {
  beforeEach(() => {
    useAiExecutionDiagnosticsStore.getState().clearAll()
    localStorage.clear()
  })

  it('creates a filesystem-safe export filename', () => {
    expect(aiExecutionDiagnosticsFilename('2026-08-05T02:51:53.866Z')).toBe(
      'mediprisma-ai-diagnostics_2026-08-05_02-51-53-866.json',
    )
  })

  it('formats a human-readable clock with an explicit local time zone', () => {
    expect(formatAiExecutionTimestamp(
      '2026-08-05T02:51:53.866Z',
      'zh-TW',
      'Asia/Taipei',
    )).toMatch(/^2026\/08\/05 10:51:53 \[?GMT\+08:00\]? \(Asia\/Taipei\)$/)
  })

  it('exports explicit UTC and local timestamps instead of an ambiguous time field', () => {
    const payload = buildAiExecutionDiagnosticsExport(
      'medical-summary',
      [{ ...base, id: 'one', operationKey: 'summary-slot' }],
      '2026-08-05T03:00:00.000Z',
      'Asia/Taipei',
    )

    expect(payload).toMatchObject({
      version: 2,
      exportedAtUtc: '2026-08-05T03:00:00.000Z',
      exportedAtLocal: expect.stringContaining('11:00:00'),
      timeZone: 'Asia/Taipei',
      executions: [expect.objectContaining({
        timestampUtc: '2026-08-05T02:51:53.866Z',
        timestampLocal: expect.stringContaining('10:51:53'),
        timeZone: 'Asia/Taipei',
      })],
    })
    expect(payload.executions[0]).not.toHaveProperty('timestamp')
  })

  it('keeps only the newest two records in volatile memory', () => {
    localStorage.setItem('sentinel', 'keep')
    const store = useAiExecutionDiagnosticsStore.getState()
    store.addRecord({ ...base, id: 'one', operationKey: 'one' })
    store.addRecord({ ...base, id: 'two', operationKey: 'two' })
    store.addRecord({ ...base, id: 'three', operationKey: 'three' })

    expect(useAiExecutionDiagnosticsStore.getState().records.map(({ id }) => id)).toEqual([
      'two',
      'three',
    ])
    expect(Object.fromEntries(Array.from(
      { length: localStorage.length },
      (_, index) => {
        const key = localStorage.key(index) ?? ''
        return [key, localStorage.getItem(key)]
      },
    ))).toEqual({ sentinel: 'keep' })
  })

  it('marks the newest matching execution when app validation rejects its output', () => {
    const store = useAiExecutionDiagnosticsStore.getState()
    store.addRecord({ ...base, id: 'older', operationKey: 'summary-slot' })
    store.addRecord({ ...base, id: 'latest', operationKey: 'summary-slot' })

    store.markLatestOperationFeatureError(
      'summary-slot',
      'medical-summary',
      'investigations: GROUNDING_FAILED (unknown source keys: L9)',
    )

    expect(useAiExecutionDiagnosticsStore.getState().records).toEqual([
      expect.objectContaining({ id: 'older', status: 'completed', hasError: false }),
      expect.objectContaining({
        id: 'latest',
        status: 'error',
        hasError: true,
        errorMessage: 'investigations: GROUNDING_FAILED (unknown source keys: L9)',
      }),
    ])
  })

  it('clears only records belonging to the requested operation', () => {
    const store = useAiExecutionDiagnosticsStore.getState()
    store.addRecord({ ...base, id: 'one', operationKey: 'summary-slot' })
    store.addRecord({ ...base, id: 'two', operationKey: 'safety-slot' })

    useAiExecutionDiagnosticsStore.getState().clearOperation('summary-slot')

    expect(useAiExecutionDiagnosticsStore.getState().records.map(({ id }) => id)).toEqual(['two'])
  })
})
