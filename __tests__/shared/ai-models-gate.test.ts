// gateModel is the single graceful-degradation rule every AI call relies on:
// a key-required model the user has no key for must downgrade to the free,
// proxy-eligible default model — never dead-end with "API key is missing".
import { gateModel, gateModelForKeys, DEFAULT_MODEL_ID } from '@/src/shared/constants/ai-models.constants'

describe('gateModel — downgrade stranded premium models', () => {
  it('leaves a free (proxy-eligible) model untouched, with or without a key', () => {
    expect(gateModel('gemini-3.1-flash-lite', false)).toBe('gemini-3.1-flash-lite')
    expect(gateModel('gemini-3.1-flash-lite', true)).toBe('gemini-3.1-flash-lite')
    // Gemini 3 Flash Preview is now a second free (proxy-eligible) Gemini tier
    expect(gateModel('gemini-3-flash-preview', false)).toBe('gemini-3-flash-preview')
    expect(gateModel('gemini-3-flash-preview', true)).toBe('gemini-3-flash-preview')
  })

  it('keeps a key-required model when the user HAS the provider key', () => {
    expect(gateModel('gemini-3.5-flash', true)).toBe('gemini-3.5-flash')
    expect(gateModel('gpt-5.4-mini', true)).toBe('gpt-5.4-mini')
  })

  it('downgrades a key-required model to the free default when no key', () => {
    // every stranded premium pick lands on the one free default, regardless of
    // its original provider — a single predictable fallback.
    expect(gateModel('gemini-3.5-flash', false)).toBe(DEFAULT_MODEL_ID)
    expect(gateModel('gpt-5.4-mini', false)).toBe(DEFAULT_MODEL_ID)
    expect(gateModel('claude-opus-4-8', false)).toBe(DEFAULT_MODEL_ID)
  })

  it('falls back to the default for an unknown model id', () => {
    expect(gateModel('totally-made-up', false)).toBe(DEFAULT_MODEL_ID)
    expect(gateModel('totally-made-up', false, 'gpt-5.4-nano')).toBe('gpt-5.4-nano')
  })
})

// gateModelForKeys is what the deep-mode agent path (useAgentChat) calls: it owns
// the user's three provider keys and must downgrade exactly like normal mode does
// inside the stream adapter. This locks the fix for the "picked Opus, no key, deep
// mode → AI 服務發生錯誤" bug — deep mode must run the free default, not dead-end.
describe('gateModelForKeys — provider-key-aware gate (deep-mode path)', () => {
  it('downgrades a key-required model to the free default when no matching key', () => {
    expect(gateModelForKeys('claude-opus-4-8', {})).toBe(DEFAULT_MODEL_ID)
    expect(gateModelForKeys('gemini-3.5-flash', {})).toBe(DEFAULT_MODEL_ID)
    expect(gateModelForKeys('gpt-5.4-mini', {})).toBe(DEFAULT_MODEL_ID)
  })

  it('keeps a key-required model when the matching provider key IS present', () => {
    expect(gateModelForKeys('claude-opus-4-8', { claudeKey: 'k' })).toBe('claude-opus-4-8')
    expect(gateModelForKeys('gemini-3.5-flash', { geminiKey: 'k' })).toBe('gemini-3.5-flash')
    expect(gateModelForKeys('gpt-5.4-mini', { openAiKey: 'k' })).toBe('gpt-5.4-mini')
  })

  it('a key for a DIFFERENT provider does not rescue the pick', () => {
    // Opus needs a Claude key; Gemini/OpenAI keys must not keep it on Opus.
    expect(gateModelForKeys('claude-opus-4-8', { geminiKey: 'k', openAiKey: 'k' })).toBe(DEFAULT_MODEL_ID)
  })

  it('leaves a free (proxy-eligible) model untouched regardless of keys', () => {
    expect(gateModelForKeys('gemini-3-flash-preview', {})).toBe('gemini-3-flash-preview')
    expect(gateModelForKeys('gemini-3.1-flash-lite', { claudeKey: 'k' })).toBe('gemini-3.1-flash-lite')
  })
})
