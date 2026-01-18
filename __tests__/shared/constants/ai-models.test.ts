import {
  GPT_MODELS,
  GEMINI_MODELS,
  INTERNAL_MODELS,
  DEFAULT_MODEL_ID,
  isGptModelId,
  isGeminiModelId,
  isModelId,
  getModelDefinition,
  ALL_MODELS
} from '@/src/shared/constants/ai-models.constants'

describe('ai-models.constants', () => {
  describe('Model definitions', () => {
    it('should have GPT models defined', () => {
      expect(GPT_MODELS.length).toBeGreaterThan(0)
      GPT_MODELS.forEach(model => {
        expect(model.provider).toBe('openai')
        expect(model.id).toBeDefined()
        expect(model.label).toBeDefined()
      })
    })

    it('should have Gemini models defined', () => {
      expect(GEMINI_MODELS.length).toBeGreaterThan(0)
      GEMINI_MODELS.forEach(model => {
        expect(model.provider).toBe('gemini')
        expect(model.id).toBeDefined()
        expect(model.label).toBeDefined()
      })
    })

    it('should have internal models defined', () => {
      expect(INTERNAL_MODELS.length).toBeGreaterThan(0)
      INTERNAL_MODELS.forEach(model => {
        expect(model.id).toBeDefined()
        expect(model.label).toBeDefined()
        expect(model.provider).toBeDefined()
      })
    })

    it('should have all models combined', () => {
      const expectedLength = INTERNAL_MODELS.length + GPT_MODELS.length + GEMINI_MODELS.length
      expect(ALL_MODELS.length).toBe(expectedLength)
    })
  })

  describe('DEFAULT_MODEL_ID', () => {
    it('should be a valid Gemini model', () => {
      expect(DEFAULT_MODEL_ID).toBe('gemini-3-flash-preview')
      expect(isGeminiModelId(DEFAULT_MODEL_ID)).toBe(true)
    })
  })

  describe('isGptModelId', () => {
    it('should return true for GPT model IDs', () => {
      expect(isGptModelId('gpt-5-mini')).toBe(true)
      expect(isGptModelId('gpt-5.1')).toBe(true)
      expect(isGptModelId('gpt-5.2')).toBe(true)
    })

    it('should return false for non-GPT model IDs', () => {
      expect(isGptModelId('gemini-3-flash-preview')).toBe(false)
      expect(isGptModelId('unknown-model')).toBe(false)
      expect(isGptModelId('')).toBe(false)
    })
  })

  describe('isGeminiModelId', () => {
    it('should return true for Gemini model IDs', () => {
      expect(isGeminiModelId('gemini-3-flash-preview')).toBe(true)
      expect(isGeminiModelId('gemini-2.5-pro')).toBe(true)
      expect(isGeminiModelId('gemini-3-pro-preview')).toBe(true)
    })

    it('should return false for non-Gemini model IDs', () => {
      expect(isGeminiModelId('gpt-5-mini')).toBe(false)
      expect(isGeminiModelId('unknown-model')).toBe(false)
      expect(isGeminiModelId('')).toBe(false)
    })
  })

  describe('isModelId', () => {
    it('should return true for all valid model IDs', () => {
      expect(isModelId('gpt-5-mini')).toBe(true)
      expect(isModelId('gemini-3-flash-preview')).toBe(true)
      expect(isModelId('gpt-5-nano')).toBe(true)
      expect(isModelId('gemini-2.5-flash-lite')).toBe(true)
    })

    it('should return false for invalid model IDs', () => {
      expect(isModelId('unknown-model')).toBe(false)
      expect(isModelId('')).toBe(false)
      expect(isModelId('random-string')).toBe(false)
    })
  })

  describe('getModelDefinition', () => {
    it('should return model definition for valid ID', () => {
      const model = getModelDefinition('gpt-5-mini')
      expect(model).toBeDefined()
      expect(model?.id).toBe('gpt-5-mini')
      expect(model?.provider).toBe('openai')
    })

    it('should return model definition for Gemini models', () => {
      const model = getModelDefinition('gemini-3-flash-preview')
      expect(model).toBeDefined()
      expect(model?.id).toBe('gemini-3-flash-preview')
      expect(model?.provider).toBe('gemini')
    })

    it('should return model definition for internal models', () => {
      const model = getModelDefinition('gpt-5-nano')
      expect(model).toBeDefined()
      expect(model?.id).toBe('gpt-5-nano')
      expect(model?.provider).toBe('openai')
    })

    it('should return undefined for invalid ID', () => {
      expect(getModelDefinition('unknown-model')).toBeUndefined()
      expect(getModelDefinition('')).toBeUndefined()
    })
  })

  describe('Model properties', () => {
    it('should have requiresUserKey flag on some models', () => {
      const modelWithKey = GPT_MODELS.find(m => 'requiresUserKey' in m && m.requiresUserKey)
      expect(modelWithKey).toBeDefined()
    })

    it('should have models without requiresUserKey flag', () => {
      const modelWithoutKey = GPT_MODELS.find(m => !('requiresUserKey' in m) || !m.requiresUserKey)
      expect(modelWithoutKey).toBeDefined()
    })
  })
})
