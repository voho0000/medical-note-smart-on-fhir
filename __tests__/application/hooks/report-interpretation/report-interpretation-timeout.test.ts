import {
  ReportInterpretationTimeoutError,
  withReportInterpretationTimeout,
} from '@/src/application/hooks/report-interpretation/report-interpretation-timeout'

describe('withReportInterpretationTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns a result that finishes before the total deadline', async () => {
    await expect(withReportInterpretationTimeout(async () => 'done', 1000))
      .resolves.toBe('done')
  })

  it('aborts and reports a timeout even when the operation never settles', async () => {
    let signal: AbortSignal | undefined
    const run = withReportInterpretationTimeout(
      async (operationSignal) => {
        signal = operationSignal
        return await new Promise<string>(() => {})
      },
      1500,
    )

    await Promise.resolve()
    expect(signal?.aborted).toBe(false)

    jest.advanceTimersByTime(1500)

    await expect(run).rejects.toBeInstanceOf(ReportInterpretationTimeoutError)
    expect(signal?.aborted).toBe(true)
  })

  it('does not accept a partial result from a transport that resolves on abort', async () => {
    const run = withReportInterpretationTimeout(
      async (signal) => await new Promise<string>((resolve) => {
        signal.addEventListener('abort', () => resolve('partial'), { once: true })
      }),
      500,
    )

    await Promise.resolve()
    jest.advanceTimersByTime(500)

    await expect(run).rejects.toBeInstanceOf(ReportInterpretationTimeoutError)
  })
})
