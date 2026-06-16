import {
  truncateToContextWindow,
  selectMessagesToSend,
  type Message,
} from '@/src/shared/utils/context-window-manager'

const msg = (role: string, content: string): Message => ({ role, content })

describe('selectMessagesToSend', () => {
  const messages = ['a', 'b', 'c', 'd'].map((c, i) => ({ id: i, content: c }))

  it('returns the last `keepCount` messages', () => {
    expect(selectMessagesToSend(messages, 2)).toEqual([
      { id: 2, content: 'c' },
      { id: 3, content: 'd' },
    ])
  })

  it('returns all messages when keepCount >= length', () => {
    expect(selectMessagesToSend(messages, 10)).toEqual(messages)
  })

  it('returns [] for an empty input regardless of keepCount', () => {
    expect(selectMessagesToSend([], 0)).toEqual([])
    expect(selectMessagesToSend([], 5)).toEqual([])
  })

  // Regression guard: the bug was `messages.slice(-keepCount)` with keepCount 0.
  // In JS `slice(-0) === slice(0)` returns the WHOLE array — so when truncation
  // fit nothing, the old code sent the entire history (the opposite of
  // truncating). The helper must fall back to just the latest turn instead.
  it('falls back to only the latest message when keepCount is 0 (does NOT send all)', () => {
    const result = selectMessagesToSend(messages, 0)
    expect(result).toEqual([{ id: 3, content: 'd' }])
    expect(result).toHaveLength(1)
    expect(result).not.toEqual(messages)
  })

  it('treats negative keepCount the same as 0 (latest only)', () => {
    expect(selectMessagesToSend(messages, -3)).toEqual([{ id: 3, content: 'd' }])
  })
})

describe('truncateToContextWindow', () => {
  it('keeps the most recent messages that fit within the budget', () => {
    // gpt-4 limit 7000, reserve 1000 → ~6000 available. Each message ≈ 2004
    // tokens (8000 chars / 4 + 4 overhead), so only the last two fit.
    const messages = Array.from({ length: 6 }, (_, i) => msg('user', `${i}:` + 'x'.repeat(8000)))
    const out = truncateToContextWindow(messages, {
      modelId: 'gpt-4',
      systemPrompt: 'sys',
      maxResponseTokens: 1000,
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(messages.length)
    // Whatever survives must be a contiguous suffix (the most recent turns).
    expect(out).toEqual(messages.slice(messages.length - out.length))
  })

  it('returns [] when the system prompt alone exceeds the budget', () => {
    const out = truncateToContextWindow([msg('user', 'hello')], {
      modelId: 'gpt-4', // 7000 limit
      systemPrompt: 'x'.repeat(20000), // ≈ 5000 tokens > 3000 available
      maxResponseTokens: 4000,
    })
    expect(out).toEqual([])
  })

  // The interaction the audit flagged: truncate returns [], and the caller must
  // NOT end up sending the whole history.
  it('integrates with selectMessagesToSend so an empty truncation sends one turn, not all', () => {
    const original = ['q1', 'q2', 'q3'].map((c) => msg('user', c))
    const truncated = truncateToContextWindow(original, {
      modelId: 'gpt-4',
      systemPrompt: 'x'.repeat(20000),
      maxResponseTokens: 4000,
    })
    expect(truncated).toEqual([])
    const sent = selectMessagesToSend(original, truncated.length)
    expect(sent).toEqual([msg('user', 'q3')])
    expect(sent).not.toEqual(original)
  })
})
