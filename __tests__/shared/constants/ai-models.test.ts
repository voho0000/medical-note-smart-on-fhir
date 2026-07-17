// Tests for ai-models.constants. Avoid hard-coding model IDs in assertions
// where possible — model IDs evolve (gpt-5 → gpt-5.4 → …) and the test
// must keep validating *the contract* not a snapshot of the IDs at one
// point in time. Where an actual ID is needed, pull it from the
// constants themselves.
import {
  GPT_MODELS,
  GEMINI_MODELS,
  CLAUDE_MODELS,
  CUSTOM_MODELS,
  INTERNAL_MODELS,
  ALL_MODELS,
  DEFAULT_MODEL_ID,
  isGptModelId,
  isGeminiModelId,
  isModelId,
  getModelDefinition,
} from '@/src/shared/constants/ai-models.constants'

describe('ai-models.constants', () => {
  describe('Model lists', () => {
    it('has at least one GPT model, all tagged provider="openai"', () => {
      expect(GPT_MODELS.length).toBeGreaterThan(0)
      GPT_MODELS.forEach((model) => {
        expect(model.provider).toBe('openai')
        expect(model.id).toBeDefined()
        expect(model.label).toBeDefined()
      })
    })

    it('has at least one Gemini model, all tagged provider="gemini"', () => {
      expect(GEMINI_MODELS.length).toBeGreaterThan(0)
      GEMINI_MODELS.forEach((model) => {
        expect(model.provider).toBe('gemini')
        expect(model.id).toBeDefined()
        expect(model.label).toBeDefined()
      })
    })

    it('has internal models with all required fields', () => {
      expect(INTERNAL_MODELS.length).toBeGreaterThan(0)
      INTERNAL_MODELS.forEach((model) => {
        expect(model.id).toBeDefined()
        expect(model.label).toBeDefined()
        expect(model.provider).toBeDefined()
      })
    })

    it('ALL_MODELS = internal + every user-selectable provider list', () => {
      expect(ALL_MODELS.length).toBe(
        INTERNAL_MODELS.length + GPT_MODELS.length + GEMINI_MODELS.length + CLAUDE_MODELS.length + CUSTOM_MODELS.length,
      )
    })
  })

  describe('DEFAULT_MODEL_ID', () => {
    it('is a valid Gemini model that passes the isGeminiModelId check', () => {
      expect(isGeminiModelId(DEFAULT_MODEL_ID)).toBe(true)
    })
  })

  describe('isGptModelId', () => {
    it('returns true for every id in GPT_MODELS', () => {
      GPT_MODELS.forEach((m) => expect(isGptModelId(m.id)).toBe(true))
    })

    it('returns false for Gemini ids', () => {
      GEMINI_MODELS.forEach((m) => expect(isGptModelId(m.id)).toBe(false))
    })

    it('returns false for unknown / empty strings', () => {
      expect(isGptModelId('unknown-model')).toBe(false)
      expect(isGptModelId('')).toBe(false)
    })
  })

  describe('isGeminiModelId', () => {
    it('returns true for every id in GEMINI_MODELS', () => {
      GEMINI_MODELS.forEach((m) => expect(isGeminiModelId(m.id)).toBe(true))
    })

    it('returns false for GPT ids', () => {
      GPT_MODELS.forEach((m) => expect(isGeminiModelId(m.id)).toBe(false))
    })

    it('returns false for unknown / empty strings', () => {
      expect(isGeminiModelId('unknown-model')).toBe(false)
      expect(isGeminiModelId('')).toBe(false)
    })
  })

  describe('isModelId', () => {
    it('returns true for every id in ALL_MODELS (user + internal)', () => {
      ALL_MODELS.forEach((m) => expect(isModelId(m.id)).toBe(true))
    })

    it('returns false for unknown / empty strings', () => {
      expect(isModelId('unknown-model')).toBe(false)
      expect(isModelId('')).toBe(false)
      expect(isModelId('random-string')).toBe(false)
    })
  })

  describe('getModelDefinition', () => {
    it('returns the matching definition for every known model id', () => {
      ALL_MODELS.forEach((m) => {
        const def = getModelDefinition(m.id)
        expect(def).toBeDefined()
        // Internal + user list overlap on some ids; getModelDefinition uses
        // `find` so the FIRST match wins — assert provider matches at least
        // one entry rather than insisting on exact equality.
        const candidates = ALL_MODELS.filter((x) => x.id === m.id)
        expect(candidates.some((c) => c.provider === def!.provider)).toBe(true)
      })
    })

    it('returns undefined for unknown ids', () => {
      expect(getModelDefinition('unknown-model')).toBeUndefined()
      expect(getModelDefinition('')).toBeUndefined()
    })
  })

  describe('Per-model flags', () => {
    it('at least one GPT model is marked requiresUserKey (BYO-key tier exists)', () => {
      const byok = GPT_MODELS.find((m) => 'requiresUserKey' in m && m.requiresUserKey)
      expect(byok).toBeDefined()
    })

    it('at least one GPT model is NOT marked requiresUserKey (free tier exists)', () => {
      const free = GPT_MODELS.find((m) => !('requiresUserKey' in m) || !m.requiresUserKey)
      expect(free).toBeDefined()
    })
  })
})
