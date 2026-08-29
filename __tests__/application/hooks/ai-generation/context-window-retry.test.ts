import {
  providerClinicalContextSafetyFraction,
  runWithContextWindowRetry,
} from '@/src/application/hooks/ai-generation/context-window-retry'
import { clinicalContextTokenTarget } from '@/src/core/utils/adaptive-clinical-context.utils'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

function liteLlmContextError(): Error {
  return Object.assign(new Error('Failed after 3 attempts'), {
    name: 'AI_RetryError',
    lastError: {
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          message: "litellm.BadRequestError: ContextWindowExceededError: This model's maximum context length is 262144 tokens. However, your prompt contains at least 262145 input tokens.",
        },
      }),
    },
  })
}

describe('context-window provider retry', () => {
  it('uses conservative first-request headroom for TVGHBrain/Gemma tokenizers', async () => {
    const clinicalContext = `BEGIN-${'病歷'.repeat(150_000)}-END`
    const execute = jest.fn(async (request: string) => request)

    const result = await runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 262_144,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: (fitted) => ({ request: fitted, requestText: fitted }),
      execute,
    })

    expect(providerClinicalContextSafetyFraction('tvghbrain3.5')).toBe(0.65)
    expect(providerClinicalContextSafetyFraction('gemma4:31b')).toBe(0.65)
    expect(estimateTokens(result.clinicalContext)).toBeLessThanOrEqual(
      Math.floor(clinicalContextTokenTarget(262_144) * 0.65),
    )
    expect(result.clinicalContext).toContain('omitted to fit the selected model')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('shrinks and retries inside the same generation after LiteLLM rejects the estimate', async () => {
    const clinicalContext = `BEGIN-${'病歷'.repeat(145_000)}-END`
    const requests: string[] = []
    const execute = jest.fn(async (request: string) => {
      requests.push(request)
      if (requests.length === 1) throw liteLlmContextError()
      return 'completed summary'
    })
    const onRetry = jest.fn()

    const result = await runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 262_144,
      modelId: 'custom-openai:hospital-model',
      modelName: 'hospital-model',
      locale: 'zh-TW',
      buildRequest: (fitted) => ({ request: fitted, requestText: fitted }),
      execute,
      onRetry,
    })

    expect(result.value).toBe('completed summary')
    expect(result.retryCount).toBe(1)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(estimateTokens(requests[1])).toBeLessThan(estimateTokens(requests[0]))
    expect(onRetry).toHaveBeenCalledWith('provider-overflow', 1)
  })

  it('reduces a locally detected complete-request overflow before sending', async () => {
    const clinicalContext = `BEGIN-${'record '.repeat(170_000)}-END`
    const execute = jest.fn(async () => 'completed summary')

    const result = await runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 120_000,
      modelId: 'gpt-5.4-nano',
      modelName: 'GPT-5.4 Nano',
      locale: 'zh-TW',
      buildRequest: (fitted) => ({
        request: fitted,
        requestText: `${fitted}\n${'fixed prompt '.repeat(12_000)}`,
      }),
      execute,
    })

    expect(result.retryCount).toBeGreaterThan(0)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(estimateTokens(result.clinicalContext)).toBeLessThan(
      estimateTokens(clinicalContext),
    )
  })
})
