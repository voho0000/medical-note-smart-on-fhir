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
    expect(en).toContain('input budget')
  })

  it('distinguishes selected records from the complete request and explains the usable budget', () => {
    // CJK estimate: 1 token / 1.5 chars. This models the reported case:
    // ~4.6k selected records inside a ~13k complete request on the 15k custom
    // model, whose usable input budget is 11k after reserving a 4k reply.
    const selectedContext = '病'.repeat(6900)
    const completeRequest = '病'.repeat(19500)
    const warning = preflightContextWarning(
      completeRequest,
      'openai-compatible-custom',
      'zh-TW',
      { selectedContext },
    )

    expect(warning).toContain('完整輸入約 13k tokens')
    expect(warning).toContain('選取的病歷約 4.6k tokens')
    expect(warning).toContain('約 11k tokens 的可用輸入空間')
    expect(warning).toContain('總內容視窗約 15k')
    expect(warning).toContain('保留 4k 供模型回覆')
    expect(warning).not.toContain('選取的病歷資料約 13k')
  })

  it('uses a custom endpoint context-window override', () => {
    const selectedContext = '病'.repeat(6900)
    const completeRequest = '病'.repeat(19500)

    expect(preflightContextWarning(
      completeRequest,
      'openai-compatible-custom',
      'zh-TW',
      { selectedContext, contextLimit: 32768 },
    )).toBeNull()
  })
})
