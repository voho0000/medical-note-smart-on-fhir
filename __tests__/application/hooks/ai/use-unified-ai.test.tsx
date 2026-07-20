import { act, renderHook, waitFor } from '@testing-library/react'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'

const mockStream = jest.fn()
const mockQuery = jest.fn()

jest.mock('@/src/application/stores/ai-config.store', () => ({
  useAllApiKeys: () => ({
    apiKey: 'openai-key',
    geminiKey: '',
    claudeKey: '',
    openAiCompatible: null,
  }),
}))
jest.mock('@/src/infrastructure/ai/services/ai.service', () => ({
  AiService: jest.fn().mockImplementation(() => ({})),
}))
jest.mock('@/src/core/use-cases/ai/query-ai.use-case', () => ({
  QueryAiUseCase: jest.fn().mockImplementation(() => ({ execute: mockQuery })),
}))
jest.mock('@/src/infrastructure/ai/streaming/stream-orchestrator', () => ({
  StreamOrchestrator: jest.fn().mockImplementation(() => ({ stream: mockStream })),
}))

describe('useUnifiedAi cancellation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('throws after an adapter resolves an aborted structured stream', async () => {
    let finishStream!: () => void
    mockStream.mockImplementationOnce(async (options: {
      onChunk: (chunk: string) => void
    }) => {
      options.onChunk('{"partial":true')
      await new Promise<void>((resolve) => { finishStream = resolve })
    })
    const onComplete = jest.fn()
    const { result } = renderHook(() => useUnifiedAi())

    let streaming!: Promise<string>
    act(() => {
      streaming = result.current.stream(
        [{ role: 'user', content: 'summarise' }],
        {
          modelId: 'gpt-5.4-nano',
          throwOnAbort: true,
          onComplete,
        },
      )
    })
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1))

    act(() => result.current.stop())
    let rejection: unknown
    await act(async () => {
      finishStream()
      try {
        await streaming
      } catch (error) {
        rejection = error
      }
    })

    expect(rejection).toBeInstanceOf(Error)
    expect((rejection as Error).name).toBe('AbortError')
    expect(onComplete).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })

  it('stops only the requested generation slot and leaves background work running', async () => {
    let finishFirst!: () => void
    let finishSecond!: () => void
    const signals: AbortSignal[] = []
    mockStream
      .mockImplementationOnce(async (options: { signal: AbortSignal }) => {
        signals.push(options.signal)
        await new Promise<void>((resolve) => { finishFirst = resolve })
      })
      .mockImplementationOnce(async (options: { signal: AbortSignal }) => {
        signals.push(options.signal)
        await new Promise<void>((resolve) => { finishSecond = resolve })
      })
    const { result } = renderHook(() => useUnifiedAi())

    let first!: Promise<string>
    let second!: Promise<string>
    act(() => {
      first = result.current.stream(
        [{ role: 'user', content: 'scope one' }],
        { modelId: 'gpt-5.4-nano', operationKey: 'slot-one', throwOnAbort: true },
      )
      second = result.current.stream(
        [{ role: 'user', content: 'scope two' }],
        { modelId: 'gpt-5.4-nano', operationKey: 'slot-two', throwOnAbort: true },
      )
    })
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(2))

    act(() => result.current.stop('slot-two'))
    expect(signals[0]?.aborted).toBe(false)
    expect(signals[1]?.aborted).toBe(true)
    expect(result.current.isLoading).toBe(true)

    let secondError: unknown
    await act(async () => {
      finishSecond()
      try {
        await second
      } catch (error) {
        secondError = error
      }
    })
    expect((secondError as Error).name).toBe('AbortError')
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      finishFirst()
      await first
    })
    expect(result.current.isLoading).toBe(false)
  })
})
