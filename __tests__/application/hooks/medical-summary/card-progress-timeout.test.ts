import {
  MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS,
  streamWithCardProgressTimeout,
} from '@/src/application/hooks/medical-summary/card-progress-timeout'

describe('streamWithCardProgressTimeout', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('aborts the current attempt after 45 seconds without a valid card', async () => {
    let attemptSignal!: AbortSignal
    let emitChunk!: (text: string) => void
    let finish!: (text: string) => void
    const parsedChunks: string[] = []
    const streaming = streamWithCardProgressTimeout({
      stream: (signal, onChunk) => {
        attemptSignal = signal
        emitChunk = onChunk
        return new Promise<string>((resolve) => { finish = resolve })
      },
      onChunk: (text) => {
        parsedChunks.push(text)
        return text.includes('VALID_CARD')
      },
    })

    emitChunk('token activity without a complete card')
    jest.advanceTimersByTime(MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS)

    expect(attemptSignal.aborted).toBe(true)
    emitChunk('VALID_CARD from the stale attempt')
    finish('late full response')
    await expect(streaming).resolves.toEqual({
      fullText: 'token activity without a complete card',
      timedOut: true,
    })
    expect(parsedChunks).not.toContain('VALID_CARD from the stale attempt')
  })

  it('restarts the 45-second window only when a new valid card is published', async () => {
    let attemptSignal!: AbortSignal
    let emitChunk!: (text: string) => void
    let finish!: (text: string) => void
    const seen = new Set<string>()
    const streaming = streamWithCardProgressTimeout({
      stream: (signal, onChunk) => {
        attemptSignal = signal
        emitChunk = onChunk
        return new Promise<string>((resolve) => { finish = resolve })
      },
      onChunk: (text) => {
        const match = text.match(/VALID_CARD_(\d)/)
        if (!match || seen.has(match[0])) return false
        seen.add(match[0])
        return true
      },
    })

    jest.advanceTimersByTime(30_000)
    emitChunk('VALID_CARD_1')
    jest.advanceTimersByTime(30_000)
    expect(attemptSignal.aborted).toBe(false)

    emitChunk('VALID_CARD_1 plus more tokens')
    jest.advanceTimersByTime(15_000)
    expect(attemptSignal.aborted).toBe(true)

    finish('late response')
    await expect(streaming).resolves.toEqual({
      fullText: 'VALID_CARD_1 plus more tokens',
      timedOut: true,
    })
  })
})
