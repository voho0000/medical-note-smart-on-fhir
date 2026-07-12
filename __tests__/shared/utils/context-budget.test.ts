import {
  evaluateContextBudget,
  preflightContextWarning,
  DEFAULT_RESPONSE_RESERVE,
  WARN_FRACTION,
} from '@/src/shared/utils/context-budget'

// gpt-5.4-nano has a 120000 context limit (ai-models.constants).
const GPT = 'gpt-5.4-nano'

describe('evaluateContextBudget', () => {
  const usable = 120000 - DEFAULT_RESPONSE_RESERVE

  it('grades well-under budget as ok', () => {
    const b = evaluateContextBudget(1000, GPT)
    expect(b.level).toBe('ok')
    expect(b.usable).toBe(usable)
  })

  it('grades the warn band (>=80%, <100% of usable) as warn', () => {
    const b = evaluateContextBudget(Math.ceil(usable * (WARN_FRACTION + 0.05)), GPT)
    expect(b.level).toBe('warn')
  })

  it('grades over-usable as over', () => {
    const b = evaluateContextBudget(usable + 1, GPT)
    expect(b.level).toBe('over')
    expect(b.fraction).toBeGreaterThan(1)
  })

  it('unknown model falls back to the conservative floor (15000)', () => {
    const b = evaluateContextBudget(20000, 'no-such-model')
    expect(b.limit).toBe(15000)
    expect(b.level).toBe('over')
  })
})

describe('preflightContextWarning', () => {
  it('returns null when the context fits', () => {
    expect(preflightContextWarning('short context', GPT, 'zh-TW')).toBeNull()
  })

  it('returns a localized warning when over budget', () => {
    // A CJK-heavy string ~ 1 token / 1.5 chars; build one clearly over 116k tokens.
    const huge = '病'.repeat(200000)
    const zh = preflightContextWarning(huge, GPT, 'zh-TW')
    const en = preflightContextWarning(huge, GPT, 'en')
    expect(zh).toContain('超過')
    expect(en).toContain('context limit')
  })
})
