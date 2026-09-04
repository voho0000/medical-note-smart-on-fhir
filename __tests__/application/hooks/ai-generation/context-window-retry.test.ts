import {
  providerClinicalContextSafetyFraction,
  runWithContextWindowRetry,
} from '@/src/application/hooks/ai-generation/context-window-retry'
import { clinicalContextTokenTarget } from '@/src/core/utils/adaptive-clinical-context.utils'
import { estimateTokens } from '@/src/shared/utils/token-estimator'
import { ContextOverflowError } from '@/src/shared/utils/context-budget'

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
  it('does not apply Gemma safety slicing to manual documents', async () => {
    const clinicalContext = 'x'.repeat(80_000 * 4)
    const execute = jest.fn(async (text: string) => text)
    const result = await runWithContextWindowRetry({
      clinicalContext, preserveClinicalContext: true, contextLimit: 120_000,
      modelId: 'custom-openai:gemma', modelName: 'gemma4:31b', locale: 'zh-TW',
      buildRequest: text => ({ request: text, requestText: text }), execute,
    })
    expect(result.clinicalContext).toBe(clinicalContext)
    expect(result.retryCount).toBe(0)
    expect(execute).toHaveBeenCalledWith(clinicalContext)
  })

  it('blocks oversized manual documents before sending instead of truncating them', async () => {
    const execute = jest.fn()
    await expect(runWithContextWindowRetry({
      clinicalContext: 'x'.repeat(40_000 * 4), preserveClinicalContext: true, contextLimit: 32_768,
      modelId: 'test-model', modelName: 'test-model', locale: 'zh-TW',
      buildRequest: text => ({ request: text, requestText: text }), execute,
    })).rejects.toBeInstanceOf(ContextOverflowError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('only removes optional overhead on a manual-document provider overflow', async () => {
    const clinicalContext = 'complete manually selected documents'
    const error = liteLlmContextError()
    const execute = jest.fn().mockRejectedValue(error)
    const recover = jest.fn(() => true)
    const buildRequest = jest.fn(text => ({ request: text, requestText: text }))
    await expect(runWithContextWindowRetry({
      clinicalContext, preserveClinicalContext: true, contextLimit: 32_768,
      modelId: 'test-model', modelName: 'test-model', locale: 'zh-TW',
      buildRequest, execute, recoverBeforeContextReduction: recover,
    })).rejects.toBe(error)
    expect(recover).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(2)
    for (const [text] of buildRequest.mock.calls) expect(text).toBe(clinicalContext)
  })

  it('retains the existing text-fitting policy for non-VGHBrain Gemma models', async () => {
    const clinicalContext = `BEGIN-${'病歷'.repeat(150_000)}-END`
    const execute = jest.fn(async (request: string) => request)

    const result = await runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 262_144,
      modelId: 'custom-openai:gemma',
      modelName: 'gemma4:31b',
      locale: 'zh-TW',
      buildRequest: (fitted) => ({ request: fitted, requestText: fitted }),
      execute,
    })

    expect(providerClinicalContextSafetyFraction('tvghbrain3.5')).toBe(1)
    expect(providerClinicalContextSafetyFraction('gemma4:31b')).toBe(0.65)
    expect(estimateTokens(result.clinicalContext)).toBeLessThanOrEqual(
      Math.floor(clinicalContextTokenTarget(262_144) * 0.65),
    )
    expect(result.clinicalContext).toContain('omitted to fit the selected model')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('sends VGHBrain text intact under the clinical cap', async () => {
    const clinicalContext = `BEGIN-${'record '.repeat(40_000)}-END`
    const execute = jest.fn(async (request: string) => request)
    const result = await runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 262_144,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: (text) => ({ request: text, requestText: text }),
      execute,
    })
    expect(result.clinicalContext).toBe(clinicalContext)
    expect(result.retryCount).toBe(0)
    expect(execute).toHaveBeenCalledWith(clinicalContext)
  })

  it('blocks a 150001-token full request even when clinical data fits at 100K', async () => {
    const clinicalContext = 'a'.repeat(100_000 * 4)
    const guidance = 'b'.repeat(50_001 * 4)
    const execute = jest.fn()
    await expect(runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 262_144,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: (text) => ({ request: text, requestText: text + guidance }),
      execute,
    })).rejects.toMatchObject({
      issue: { limit: 154_000, usable: 150_000, requestTokens: 150_001, selectedTokens: 100_000 },
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([30_000, 50_000])('preserves 100K clinical data plus %i guidance tokens', async (guidanceTokens) => {
    const clinicalContext = 'a'.repeat(100_000 * 4)
    const completePrompt = clinicalContext + 'b'.repeat(guidanceTokens * 4)
    const execute = jest.fn(async (request: string) => request)
    const result = await runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 262_144,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: () => ({ request: completePrompt, requestText: completePrompt }),
      execute,
    })
    expect(result.clinicalContext).toBe(clinicalContext)
    expect(execute).toHaveBeenCalledWith(completePrompt)
    expect(result.retryCount).toBe(0)
  })

  it('blocks 100001 clinical tokens even when the full request is below 150K', async () => {
    const clinicalContext = 'a'.repeat(100_001 * 4)
    const execute = jest.fn()
    const recoverBeforeContextReduction = jest.fn(() => true)
    await expect(runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 262_144,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: (request) => ({ request, requestText: request }),
      execute,
      recoverBeforeContextReduction,
    })).rejects.toMatchObject({
      message: expect.stringContaining('病人 context'),
      issue: { selectedLimit: 100_000, selectedTokens: 100_001, overBy: 1, suggestedSelectedMax: 100_000 },
    })
    expect(execute).not.toHaveBeenCalled()
    expect(recoverBeforeContextReduction).not.toHaveBeenCalled()
  })

  it('fails closed when a caller supplies no selected clinical context', async () => {
    // Without `selectedContext` the overflow issue carries selectedTokens=null.
    // That unknown must count as OVER the 100K clinical cap, not as zero: an
    // unmeasured selection may not buy the optional-overhead retry and a send.
    const execute = jest.fn()
    const recoverBeforeContextReduction = jest.fn(() => true)
    await expect(runWithContextWindowRetry({
      clinicalContext: undefined as unknown as string,
      contextLimit: 154_000,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: () => {
        const requestText = 'a'.repeat(150_001 * 4)
        return { request: requestText, requestText }
      },
      execute,
      recoverBeforeContextReduction,
    })).rejects.toBeInstanceOf(ContextOverflowError)
    expect(recoverBeforeContextReduction).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('does not loop or truncate if removing optional guidance still cannot fit', async () => {
    const clinicalContext = 'a'.repeat(100_000 * 4)
    const execute = jest.fn()
    const recoverBeforeContextReduction = jest.fn(() => true)
    await expect(runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 154_000,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: (request) => ({ request, requestText: request + 'b'.repeat(51_000 * 4) }),
      execute,
      recoverBeforeContextReduction,
    })).rejects.toBeInstanceOf(ContextOverflowError)
    expect(execute).not.toHaveBeenCalled()
    expect(recoverBeforeContextReduction).toHaveBeenCalledTimes(1)
  })

  it.each([32_768, 100_000])('respects a smaller VGHBrain model window (%i)', async (limit) => {
    const text = 'a'.repeat((limit - 4_000 + 1) * 4)
    const execute = jest.fn()
    await expect(runWithContextWindowRetry({
      clinicalContext: text,
      contextLimit: limit,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: (request) => ({ request, requestText: request }),
      execute,
    })).rejects.toBeInstanceOf(ContextOverflowError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('surfaces a VGHBrain provider overflow without truncating or retrying', async () => {
    const error = liteLlmContextError()
    const execute = jest.fn(async () => { throw error })
    const onRetry = jest.fn()
    await expect(runWithContextWindowRetry({
      clinicalContext: 'complete clinical record',
      contextLimit: 100_000,
      modelId: 'custom-openai:vghtpe-tvghbrain',
      modelName: 'tvghbrain3.5',
      locale: 'zh-TW',
      buildRequest: (request) => ({ request, requestText: request }),
      execute,
      onRetry,
    })).rejects.toBe(error)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
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

  it.each(['hospital-model', 'tvghbrain3.5'])('removes optional source-index overhead before dropping clinical records (%s)', async (modelName) => {
    const clinicalContext = `BEGIN-${'record '.repeat(10_000)}-END`
    const originalTokens = estimateTokens(clinicalContext)
    let includeSourceIndex = true
    const execute = jest.fn(async () => 'completed summary')
    const recoverBeforeContextReduction = jest.fn(() => {
      includeSourceIndex = false
      return true
    })
    const onRetry = jest.fn()

    const result = await runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 40_000,
      modelId: 'custom-openai:hospital-model',
      modelName,
      locale: 'zh-TW',
      buildRequest: (fitted) => ({
        request: fitted,
        requestText: includeSourceIndex
          ? `${fitted}\n${'source-index '.repeat(20_000)}`
          : fitted,
      }),
      execute,
      recoverBeforeContextReduction,
      onRetry,
    })

    expect(result.value).toBe('completed summary')
    expect(result.retryCount).toBe(0)
    expect(estimateTokens(result.clinicalContext)).toBe(originalTokens)
    expect(recoverBeforeContextReduction).toHaveBeenCalledWith('local-preflight')
    expect(onRetry).toHaveBeenCalledWith('optional-overhead-removed', 0)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it.each(['qwen/qwen3.5-35b-a3b', 'tvghbrain3.5'])('retries without optional navigation before shrinking after a provider overflow (%s)', async (modelName) => {
    const clinicalContext = `BEGIN-${'record '.repeat(10_000)}-END`
    let sourceNavigation = true
    const requests: string[] = []
    const execute = jest.fn(async (request: string) => {
      requests.push(request)
      if (requests.length === 1) throw liteLlmContextError()
      return 'completed summary'
    })
    const recoverBeforeContextReduction = jest.fn(() => {
      sourceNavigation = false
      return true
    })

    const result = await runWithContextWindowRetry({
      clinicalContext,
      contextLimit: 262_144,
      modelId: 'custom-openai:openrouter-qwen',
      modelName,
      locale: 'zh-TW',
      buildRequest: (fitted) => ({
        request: `${sourceNavigation ? 'with-index' : 'without-index'}:${fitted}`,
        requestText: fitted,
      }),
      execute,
      recoverBeforeContextReduction,
    })

    expect(result.retryCount).toBe(0)
    expect(result.clinicalContext).toBe(clinicalContext)
    expect(requests[0]).toMatch(/^with-index:/)
    expect(requests[1]).toMatch(/^without-index:/)
    expect(recoverBeforeContextReduction).toHaveBeenCalledWith('provider-overflow')
  })
})

// A blocked manual selection must say WHICH documents are the heaviest, not
// only how many are protected.
describe('protected documents on a blocked manual selection', () => {
  const protectedDocuments = [
    { id: 'd1', title: '出院病摘 2026-01', tokens: 7_000 },
    { id: 'd2', title: '出院病摘 2025-11', tokens: 12_000 },
    { id: 'd3', title: '門診紀錄 2025-10', tokens: 500 },
    { id: 'd4', title: '出院病摘 2025-06', tokens: 9_000 },
  ]

  async function blockedIssue(documents = protectedDocuments) {
    try {
      await runWithContextWindowRetry({
        clinicalContext: 'x'.repeat(40_000 * 4),
        preserveClinicalContext: true,
        contextLimit: 32_768,
        modelId: 'test-model',
        modelName: 'test-model',
        locale: 'zh-TW',
        protectedDocuments: documents,
        buildRequest: text => ({ request: text, requestText: text }),
        execute: jest.fn(),
      })
    } catch (error) {
      return error as ContextOverflowError
    }
    throw new Error('expected a ContextOverflowError')
  }

  it('attaches the top 3 protected documents, sorted by tokens descending', async () => {
    const error = await blockedIssue()
    expect(error).toBeInstanceOf(ContextOverflowError)
    expect(error.issue.protectedDocuments).toEqual([
      { id: 'd2', title: '出院病摘 2025-11', tokens: 12_000 },
      { id: 'd4', title: '出院病摘 2025-06', tokens: 9_000 },
      { id: 'd1', title: '出院病摘 2026-01', tokens: 7_000 },
    ])
    expect(error.message).toContain('已選文件中最大的幾份：出院病摘 2025-11（~12k）')
    expect(error.message).not.toContain('門診紀錄')
  })

  it('leaves the message unchanged when the caller knows no documents', async () => {
    const error = await blockedIssue([])
    expect(error.issue.protectedDocuments).toBeUndefined()
    expect(error.message).not.toContain('已選文件中最大的幾份')
  })
})
