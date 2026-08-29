// A report explanation is intentionally a bounded, on-demand task. The shared
// stream watchdog only catches an IDLE connection; a model that keeps emitting
// tiny chunks can otherwise stay "running" indefinitely. This total deadline
// makes the user-visible lifecycle deterministic even for a non-idle stream.

export const REPORT_INTERPRETATION_TOTAL_TIMEOUT_MS = 90_000

export class ReportInterpretationTimeoutError extends Error {
  constructor(timeoutMs = REPORT_INTERPRETATION_TOTAL_TIMEOUT_MS) {
    super(`Report interpretation timed out after ${Math.round(timeoutMs / 1000)} seconds`)
    this.name = 'ReportInterpretationTimeoutError'
  }
}

export async function withReportInterpretationTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = REPORT_INTERPRETATION_TOTAL_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  const timeoutError = new ReportInterpretationTimeoutError(timeoutMs)
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort(timeoutError)
      reject(timeoutError)
    }, timeoutMs)
  })

  const running = Promise.resolve().then(() => operation(controller.signal))

  try {
    const result = await Promise.race([running, deadline])
    // Some transports treat abort as a normal partial completion. A timeout is
    // still a timeout; never let that partial value reach the JSON parser/cache.
    if (timedOut) throw timeoutError
    return result
  } catch (error) {
    // Aborting the transport can reject before the deadline promise wins its
    // race. Preserve the meaningful timeout cause instead of surfacing a vague
    // "operation was aborted" message.
    if (timedOut) throw timeoutError
    throw error
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}
