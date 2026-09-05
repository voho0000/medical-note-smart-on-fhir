import {
  getUserErrorMessage,
  isProviderContextWindowExceededError,
  isQuotaExceededError,
} from '@/src/core/errors'

describe('AI retry error messages', () => {
  it('unwraps RetryError.lastError and explains daily free quota exhaustion', () => {
    const error = Object.assign(
      new Error('Failed after 3 attempts. Last error: Forbidden'),
      {
        name: 'AI_RetryError',
        lastError: {
          message: 'Request failed',
          statusCode: 403,
          responseBody: JSON.stringify({ error: 'Daily quota exceeded' }),
        },
      },
    )

    expect(getUserErrorMessage(error)).toBe(
      '📊 今日免費使用量已用完。請明天再試，或到「設定」加入自己的 API Key 繼續使用。',
    )
    expect(isQuotaExceededError(error)).toBe(true)
  })

  it('unwraps the RetryError errors array', () => {
    const error = Object.assign(new Error('Failed after 3 attempts'), {
      errors: [
        new Error('temporary failure'),
        { responseBody: { error: 'Daily free usage limit exceeded' } },
      ],
    })

    expect(getUserErrorMessage(error)).toContain('今日免費使用量已用完')
    expect(isQuotaExceededError(error)).toBe(true)
  })

  it('does not expose raw retry implementation text for an unknown cause', () => {
    const error = new Error('Failed after 3 attempts. Last error: Unknown provider failure')

    expect(getUserErrorMessage(error)).toBe('AI 服務暂時無法完成請求，請稍後再試。')
  })

  it('maps normalized nested Responses upstream errors to recovery guidance', () => {
    const error = {
      type: 'error',
      error: {
        code: 'upstream_error',
        message: 'Upstream request failed',
      },
    }

    expect(getUserErrorMessage(error)).toBe(
      'AI 服務暫時無法回應，請稍後重試；若持續發生，請改用其他模型。',
    )
  })

  it('recognizes and localizes a nested LiteLLM context-window rejection', () => {
    const error = Object.assign(new Error('Failed after 3 attempts'), {
      lastError: {
        statusCode: 400,
        responseBody: JSON.stringify({
          error: {
            message: "litellm.BadRequestError: ContextWindowExceededError: This model's maximum context length is 262144 tokens. However, your prompt contains at least 262145 input tokens.",
          },
        }),
      },
    })

    expect(isProviderContextWindowExceededError(error)).toBe(true)
    expect(getUserErrorMessage(error)).toBe(
      '📚 病歷內容超過模型可處理的長度。系統已嘗試自動縮減；請再縮小「資料選擇」範圍，或改用內容視窗更大的模型。',
    )
  })
})
