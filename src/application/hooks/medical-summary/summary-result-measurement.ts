import { classifyAiOutcome } from '@/src/application/telemetry/ai-outcome'
import type { AiGenerationMeasurement } from '../ai-generation/run-generation-job'

/** Count final outcomes of this run's target cards, not calls or retained cards. */
export function measureSummaryCardOutcomes(
  outcomes: readonly PromiseSettledResult<{ result: unknown } | { error: 'PARSE_FAILED' }>[],
): AiGenerationMeasurement {
  const failures = outcomes.flatMap((outcome) => (
    outcome.status === 'rejected'
      ? [classifyAiOutcome(outcome.reason)]
      : 'error' in outcome.value ? ['parse_failed' as const] : []
  ))
  return {
    outcome: failures.length === 0 ? 'ok'
      : failures.every((failure) => failure === failures[0]) ? failures[0] : 'error',
    summaryCards: { succeeded: outcomes.length - failures.length, failed: failures.length },
  }
}
