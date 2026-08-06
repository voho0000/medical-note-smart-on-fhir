/** @jest-environment node */
import { runDeepModeAgent } from '@/src/infrastructure/ai/agent/run-deep-mode-agent'
import { StreamIdleTimeoutError } from '@/src/infrastructure/ai/streaming/stream-idle-timeout'

const mockStreamText = jest.fn()

jest.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  stepCountIs: jest.fn(() => 'stop-condition'),
}))

async function* textStream(text: string) {
  yield { type: 'text-delta', text }
}

async function* failedStream(): AsyncGenerator<never> {
  throw new Error('temporary endpoint failure')
}

const stalledStream: AsyncIterable<never> = {
  [Symbol.asyncIterator]() {
    return {
      next: () => new Promise<IteratorResult<never>>(() => {}),
      return: () => Promise.resolve({ value: undefined as never, done: true }),
    }
  },
}

const translations = {
  organizingResults: 'Organizing',
  queriedFhirData: 'FHIR result',
  answerQuestion: 'Answer the question',
  synthesizeResults: 'Synthesize',
  queryResult: 'Query result',
  queryFailed: 'Query failed',
  noData: 'No data',
  noDataFound: 'No data found',
  foundRecords: 'Found records',
  toolNames: { getHealthSummarySnapshot: 'Health summary' },
}

describe('runDeepModeAgent compact snapshot prefetch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('executes the no-argument tool locally and makes one synthesis request', async () => {
    const execute = jest.fn().mockResolvedValue({
      success: true,
      data: { conditions: [], medications: [], abnormalLabs: [], recentVitals: [] },
    })
    mockStreamText.mockReturnValue({
      fullStream: textStream('Complete answer'),
      usage: Promise.resolve({ inputTokens: 100, outputTokens: 20, totalTokens: 120 }),
    })

    const result = await runDeepModeAgent({
      model: {} as never,
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'health summary' },
      ],
      tools: { getHealthSummarySnapshot: { execute } } as never,
      initialToolName: 'getHealthSummarySnapshot',
      preExecuteInitialTool: true,
      reasoningEffort: 'low',
      translations,
      idleMs: 1_000,
      abortController: new AbortController(),
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({})
    expect(mockStreamText).toHaveBeenCalledTimes(1)
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      tools: undefined,
      providerOptions: { openai: { reasoningEffort: 'low' } },
    }))
    expect(result.answer).toBe('Complete answer')
    expect(result.toolCalls).toEqual(['getHealthSummarySnapshot'])
    expect(result.usage.totalTokens).toBe(120)
    expect(result.trajectory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'tool-call', toolName: 'getHealthSummarySnapshot' }),
      expect.objectContaining({ kind: 'tool-result', toolName: 'getHealthSummarySnapshot' }),
    ]))
  })

  it('retries one failed no-output synthesis without rerunning the FHIR tool', async () => {
    const execute = jest.fn().mockResolvedValue({ success: true, data: {} })
    mockStreamText
      .mockReturnValueOnce({
        fullStream: failedStream(),
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      })
      .mockReturnValueOnce({
        fullStream: textStream('Recovered answer'),
        usage: Promise.resolve({ inputTokens: 80, outputTokens: 20, totalTokens: 100 }),
      })

    const result = await runDeepModeAgent({
      model: {} as never,
      messages: [{ role: 'user', content: 'health summary' }],
      tools: { getHealthSummarySnapshot: { execute } } as never,
      initialToolName: 'getHealthSummarySnapshot',
      preExecuteInitialTool: true,
      translations,
      idleMs: 1_000,
      abortController: new AbortController(),
    })

    expect(mockStreamText).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.answer).toBe('Recovered answer')
    expect(result.usage.totalTokens).toBe(100)
  })

  it('surfaces a second idle timeout instead of treating it as a user abort', async () => {
    const execute = jest.fn().mockResolvedValue({ success: true, data: {} })
    mockStreamText.mockReturnValue({
      fullStream: stalledStream,
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    })

    const run = runDeepModeAgent({
      model: {} as never,
      messages: [{ role: 'user', content: 'health summary' }],
      tools: { getHealthSummarySnapshot: { execute } } as never,
      initialToolName: 'getHealthSummarySnapshot',
      preExecuteInitialTool: true,
      translations,
      idleMs: 10,
      abortController: new AbortController(),
    })

    await expect(run).rejects.toBeInstanceOf(StreamIdleTimeoutError)
    expect(mockStreamText).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
