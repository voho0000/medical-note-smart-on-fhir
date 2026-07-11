import { getUserErrorMessage, isQuotaExceededError } from '@/src/core/errors'

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
})
