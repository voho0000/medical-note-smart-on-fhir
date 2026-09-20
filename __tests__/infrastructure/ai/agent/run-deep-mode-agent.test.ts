/** @jest-environment node */
import {
  repeatedToolCallIs,
  runDeepModeAgent,
} from '@/src/infrastructure/ai/agent/run-deep-mode-agent'
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
      preExecuteInitialToolInput: { limit: 3 },
      reasoningEffort: 'low',
      translations,
      idleMs: 1_000,
      abortController: new AbortController(),
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith({ limit: 3 })
    expect(mockStreamText).toHaveBeenCalledTimes(1)
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      tools: undefined,
      providerOptions: { openai: { reasoningEffort: 'low' } },
    }))
    expect(result.answer).toBe('Complete answer')
    expect(result.toolCalls).toEqual(['getHealthSummarySnapshot'])
    expect(result.usage.totalTokens).toBe(120)
    expect(result.trajectory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'tool-call',
        toolName: 'getHealthSummarySnapshot',
        input: { limit: 3 },
      }),
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

describe('repeatedToolCallIs', () => {
  const step = (toolName: string, input: unknown) => ({
    toolCalls: [{ toolName, input }],
  }) as never

  it('stops consecutive equivalent calls even when object key order differs', () => {
    const stop = repeatedToolCallIs(2)

    expect(stop({ steps: [
      step('queryMedications', { status: 'active', range: { end: 2, start: 1 } }),
      step('queryMedications', { range: { start: 1, end: 2 }, status: 'active' }),
    ] })).toBe(true)
  })

  it('lets a model repeat a query once by default and stops on the third identical batch', () => {
    const stop = repeatedToolCallIs()
    const same = step('queryMedications', { status: 'active' })
    const other = step('queryLabResultsByCategory', { status: 'active' })

    expect(stop({ steps: [same, same] })).toBe(false)
    expect(stop({ steps: [same, same, other] })).toBe(false)
    expect(stop({ steps: [other, same, same, same] })).toBe(true)
  })

  it('allows a model to refine the tool or its arguments', () => {
    const stop = repeatedToolCallIs(2)

    expect(stop({ steps: [
      step('queryMedications', { status: 'active' }),
      step('queryMedications', { status: 'completed' }),
    ] })).toBe(false)
    expect(stop({ steps: [
      step('queryMedications', { status: 'active' }),
      step('queryLabResultsByCategory', { status: 'active' }),
    ] })).toBe(false)
  })
})

describe('runDeepModeAgent repeated-query stop', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const usage = Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 })
  const same = { toolCalls: [{ toolName: 'queryMedications', input: { status: 'active' } }] } as never

  it('tells the model and the reader when the tool loop was stopped for repeating a query', async () => {
    const events: Array<{ type: string; state?: string }> = []
    async function* round1() {
      yield { type: 'tool-call', toolName: 'queryMedications', input: { status: 'active' } }
      yield { type: 'tool-result', toolName: 'queryMedications', result: { success: true, data: [] } }
      // The SDK evaluates stopWhen after each step; simulate the third identical one.
      const stopWhen = mockStreamText.mock.calls[0][0].stopWhen as Array<(c: unknown) => boolean>
      expect(stopWhen[1]({ steps: [same, same, same] })).toBe(true)
    }
    mockStreamText
      .mockReturnValueOnce({ fullStream: round1(), usage })
      .mockReturnValueOnce({ fullStream: textStream('Answer from retrieved data'), usage })

    const result = await runDeepModeAgent({
      model: {} as never,
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Q' }],
      tools: {} as never,
      translations: { ...translations, repeatedQueryStopped: 'Stopped: repeated query', repeatedQueryHint: '\n\nHINT' },
      idleMs: 1000,
      abortController: new AbortController(),
      onEvent: (e) => events.push(e as never),
    })

    expect(events.some((e) => e.type === 'status' && e.state?.includes('Stopped: repeated query'))).toBe(true)
    const followUp = mockStreamText.mock.calls[1][0].messages as Array<{ role: string; content: string }>
    expect(followUp[followUp.length - 1].content).toContain('HINT')
    expect(result.answer).toBe('Answer from retrieved data\n\n_Stopped: repeated query_')
  })

  it('stays silent when the loop ended for another reason', async () => {
    const events: Array<{ type: string; state?: string }> = []
    async function* round1() {
      yield { type: 'tool-call', toolName: 'queryMedications', input: { status: 'active' } }
      yield { type: 'tool-result', toolName: 'queryMedications', result: { success: true, data: [] } }
      const stopWhen = mockStreamText.mock.calls[0][0].stopWhen as Array<(c: unknown) => boolean>
      expect(stopWhen[1]({ steps: [same] })).toBe(false)
    }
    mockStreamText
      .mockReturnValueOnce({ fullStream: round1(), usage })
      .mockReturnValueOnce({ fullStream: textStream('Plain answer'), usage })

    const result = await runDeepModeAgent({
      model: {} as never,
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Q' }],
      tools: {} as never,
      translations: { ...translations, repeatedQueryStopped: 'Stopped: repeated query', repeatedQueryHint: '\n\nHINT' },
      idleMs: 1000,
      abortController: new AbortController(),
      onEvent: (e) => events.push(e as never),
    })

    expect(events.some((e) => e.state?.includes('Stopped: repeated query'))).toBe(false)
    const followUp = mockStreamText.mock.calls[1][0].messages as Array<{ role: string; content: string }>
    expect(followUp[followUp.length - 1].content).not.toContain('HINT')
    expect(result.answer).toBe('Plain answer')
  })
})
