export const MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS = 45_000

export class MedicalSummaryCardProgressTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Medical summary card progress timed out after ${Math.round(timeoutMs / 1_000)} seconds`)
    this.name = 'MedicalSummaryCardProgressTimeoutError'
  }
}

interface StreamWithCardProgressTimeoutInput {
  stream: (
    signal: AbortSignal,
    onChunk: (streamedText: string) => void,
  ) => Promise<string>
  /** Return true only when this chunk produced at least one newly valid card. */
  onChunk: (streamedText: string) => boolean
  /** null disables the watchdog for providers outside this policy. */
  timeoutMs?: number | null
}

export interface StreamWithCardProgressTimeoutResult {
  fullText: string
  timedOut: boolean
}

/**
 * Abort one transport attempt when it stops producing newly valid cards.
 * Token-only activity deliberately does not reset the timer: the user-facing
 * unit of progress is a parsed card, not an upstream SSE heartbeat.
 */
export async function streamWithCardProgressTimeout({
  stream,
  onChunk,
  timeoutMs = MEDICAL_SUMMARY_CARD_PROGRESS_TIMEOUT_MS,
}: StreamWithCardProgressTimeoutInput): Promise<StreamWithCardProgressTimeoutResult> {
  const controller = new AbortController()
  let latestText = ''
  let timedOut = false
  let active = true
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const clearWatchdog = () => {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
    timeoutHandle = undefined
  }
  const armWatchdog = () => {
    clearWatchdog()
    if (timeoutMs === null) return
    timeoutHandle = setTimeout(() => {
      // One last synchronous parse protects a closing marker received just
      // before the timer callback. It cannot extend the deadline unless it
      // actually publishes a new valid card.
      const madeProgress = latestText ? onChunk(latestText) : false
      if (madeProgress) {
        armWatchdog()
        return
      }
      timedOut = true
      active = false
      controller.abort(new MedicalSummaryCardProgressTimeoutError(timeoutMs))
    }, timeoutMs)
  }

  armWatchdog()
  try {
    const fullText = await stream(controller.signal, (streamedText) => {
      if (!active) return
      latestText = streamedText
      if (onChunk(streamedText)) armWatchdog()
    })
    if (!timedOut) latestText = fullText
    return { fullText: latestText, timedOut }
  } catch (error) {
    // Only swallow the AbortError created by this watchdog. A user stop or
    // scope change aborts the operation-owned controller instead and must
    // still terminate the whole generation pipeline.
    if (!timedOut) throw error
    return { fullText: latestText, timedOut: true }
  } finally {
    active = false
    clearWatchdog()
  }
}
