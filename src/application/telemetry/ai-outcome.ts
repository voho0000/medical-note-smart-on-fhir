// Shared classification for the `ai_result` event.
//
// Two consumers with completely different plumbing — the structured-slot job
// (runGenerationJob) and the chat agent — must label the same failure the same
// way, or the reliability numbers cannot be compared across surfaces. Hence one
// classifier rather than an `instanceof` ladder in each.
//
// The distinctions that matter operationally: a user pressing stop is NOT a
// failure; a context overflow and an exhausted quota are actionable in totally
// different ways; a timeout is the "model stopped responding" case the idle
// watchdog exists for.
'use client'

import { AiError, AiErrorCode, isQuotaExceededError, isProviderContextWindowExceededError } from '@/src/core/errors'
import { isContextOverflowError } from '@/src/shared/utils/context-budget'
import type { AiOutcome, DurationBucket } from '@/src/application/telemetry/usage-analytics'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof AiError && error.code === AiErrorCode.TIMEOUT) return true
  if (!(error instanceof Error)) return false
  // StreamIdleTimeoutError (the stream watchdog) and
  // ReportInterpretationTimeoutError (the total deadline) both end in
  // "TimeoutError" and say "timed out"; provider SDKs vary, so test both.
  if (/TimeoutError$/.test(error.name)) return true
  return /timed out|timeout/i.test(error.message)
}

/**
 * Order matters: an abort wins over everything (a timeout-driven abort throws
 * the timeout error itself, so it is not misread here), and the two specific,
 * actionable provider rejections are tested before the generic timeout text.
 */
export function classifyAiOutcome(error: unknown): AiOutcome {
  if (isAbortError(error)) return 'aborted'
  if (isContextOverflowError(error) || isProviderContextWindowExceededError(error)) {
    return 'context_overflow'
  }
  if (isQuotaExceededError(error)) return 'quota'
  if (isTimeoutError(error)) return 'timeout'
  return 'error'
}

/** Coarse bands, so a duration can never be a fingerprint. Boundaries are
 *  inclusive at the lower end: 5000ms is `5to15`, not `lt5`. */
export function bucketDuration(durationMs: number): DurationBucket {
  if (!(durationMs >= 0)) return 'lt5'
  if (durationMs < 5_000) return 'lt5'
  if (durationMs < 15_000) return '5to15'
  if (durationMs < 45_000) return '15to45'
  return 'gt45'
}

/** Monotonic where available; `Date.now()` keeps SSR/jsdom callers working. */
export function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}
