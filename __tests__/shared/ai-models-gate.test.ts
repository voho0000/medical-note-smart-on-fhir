// gateModel is the single graceful-degradation rule every AI call relies on:
// a key-required model the user has no key for must downgrade to that provider's
// free, proxy-eligible base — never dead-end with "API key is missing".
import { gateModel, DEFAULT_MODEL_ID } from '@/src/shared/constants/ai-models.constants'

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

  it('downgrades a key-required model to the provider base when no key', () => {
    // gemini premium → gemini free base
    expect(gateModel('gemini-3.5-flash', false)).toBe('gemini-3.1-flash-lite')
    // openai premium → openai free base
    expect(gateModel('gpt-5.4-mini', false)).toBe('gpt-5.4-nano')
    // claude premium → claude free base
    expect(gateModel('claude-opus-4-8', false)).toBe('claude-haiku-4-5-20251001')
  })

  it('falls back to the default for an unknown model id', () => {
    expect(gateModel('totally-made-up', false)).toBe(DEFAULT_MODEL_ID)
    expect(gateModel('totally-made-up', false, 'gpt-5.4-nano')).toBe('gpt-5.4-nano')
  })
})
