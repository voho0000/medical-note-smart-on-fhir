// The `ai_result` classifier. Two very different call paths (the structured
// slot job and the chat agent) share it, so a failure must land in the same
// bucket whichever one produced it.
export {}

import { AiError, AiErrorCode } from '@/src/core/errors'
import { ContextOverflowError } from '@/src/shared/utils/context-budget'
import { bucketDuration, classifyAiOutcome } from '@/src/application/telemetry/ai-outcome'

function abortError(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

describe('classifyAiOutcome', () => {
  it('treats a user stop as aborted, not a failure', () => {
    expect(classifyAiOutcome(abortError())).toBe('aborted')
  })

  it('recognises our local context-budget rejection', () => {
    const error = new ContextOverflowError(
      {
        kind: 'context-overflow',
        requestTokens: 200_000,
        selectedTokens: null,
        usable: 120_000,
        limit: 128_000,
        reserve: 8_000,
        overBy: 80_000,
        suggestedSelectedMax: null,
      },
      'zh-TW',
    )
    expect(classifyAiOutcome(error)).toBe('context_overflow')
  })

  it('recognises a provider-side context-window rejection', () => {
    expect(classifyAiOutcome(new Error('maximum context length is 128000 tokens')))
      .toBe('context_overflow')
  })

  it('recognises an exhausted daily quota', () => {
    expect(classifyAiOutcome(new Error('Daily quota exceeded'))).toBe('quota')
  })

  it('recognises the stream idle-timeout watchdog', () => {
    const error = new Error('AI response timed out: the model stopped responding')
    error.name = 'StreamIdleTimeoutError'
    expect(classifyAiOutcome(error)).toBe('timeout')
  })

  it('recognises the report-interpretation total deadline', () => {
    const error = new Error('Report interpretation timed out after 90 seconds')
    error.name = 'ReportInterpretationTimeoutError'
    expect(classifyAiOutcome(error)).toBe('timeout')
  })

  it('recognises an AiError carrying the timeout code', () => {
    expect(classifyAiOutcome(new AiError('nope', AiErrorCode.TIMEOUT))).toBe('timeout')
  })

  it('falls back to a plain error for anything else', () => {
    expect(classifyAiOutcome(new Error('Internal server error'))).toBe('error')
    expect(classifyAiOutcome('a string')).toBe('error')
    expect(classifyAiOutcome(undefined)).toBe('error')
  })
})

describe('bucketDuration', () => {
  it('puts each boundary in the higher band', () => {
    expect(bucketDuration(4_999)).toBe('lt5')
    expect(bucketDuration(5_000)).toBe('5to15')
    expect(bucketDuration(14_999)).toBe('5to15')
    expect(bucketDuration(15_000)).toBe('15to45')
    expect(bucketDuration(44_999)).toBe('15to45')
    expect(bucketDuration(45_000)).toBe('gt45')
  })

  it('handles zero and nonsense without throwing', () => {
    expect(bucketDuration(0)).toBe('lt5')
    expect(bucketDuration(Number.NaN)).toBe('lt5')
    expect(bucketDuration(-1)).toBe('lt5')
  })
})
