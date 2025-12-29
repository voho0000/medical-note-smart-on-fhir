// Unit Tests: Environment Validator
import { validateEnvironment, validateAndLogEnvironment } from '@/src/shared/config/env-validator'

describe('Environment Validator', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('validateEnvironment', () => {
    it('should pass validation when all required variables are set', () => {
      process.env.TEST_VAR = 'test-value'
      process.env.ANOTHER_VAR = 'another-value'

      const result = validateEnvironment({
        required: ['TEST_VAR', 'ANOTHER_VAR']
      })

      expect(result.isValid).toBe(true)
      expect(result.missing).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    it('should fail validation when required variables are missing', () => {
      delete process.env.MISSING_VAR

      const result = validateEnvironment({
        required: ['MISSING_VAR']
      })

      expect(result.isValid).toBe(false)
      expect(result.missing).toContain('MISSING_VAR')
    })

    it('should detect multiple missing required variables', () => {
      delete process.env.VAR1
      delete process.env.VAR2

      const result = validateEnvironment({
        required: ['VAR1', 'VAR2', 'VAR3']
      })

      expect(result.isValid).toBe(false)
      expect(result.missing).toHaveLength(3)
      expect(result.missing).toContain('VAR1')
      expect(result.missing).toContain('VAR2')
      expect(result.missing).toContain('VAR3')
    })

    it('should generate warnings for missing optional variables', () => {
      delete process.env.OPTIONAL_VAR

      const result = validateEnvironment({
        optional: ['OPTIONAL_VAR']
      })

      expect(result.isValid).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('OPTIONAL_VAR')
    })

    it('should not warn when optional variables are set', () => {
      process.env.OPTIONAL_VAR = 'value'

      const result = validateEnvironment({
        optional: ['OPTIONAL_VAR']
      })

      expect(result.isValid).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })

    it('should run custom validation function', () => {
      const result = validateEnvironment({
        validate: (env) => {
          const warnings: string[] = []
          if (!env.CUSTOM_CHECK) {
            warnings.push('Custom validation failed')
          }
          return warnings
        }
      })

      expect(result.isValid).toBe(true)
      expect(result.warnings).toContain('Custom validation failed')
    })

    it('should combine all warnings', () => {
      delete process.env.OPTIONAL1
      delete process.env.OPTIONAL2

      const result = validateEnvironment({
        optional: ['OPTIONAL1', 'OPTIONAL2'],
        validate: () => ['Custom warning']
      })

      expect(result.warnings).toHaveLength(3)
    })

    it('should handle empty config', () => {
      const result = validateEnvironment({})

      expect(result.isValid).toBe(true)
      expect(result.missing).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('validateAndLogEnvironment', () => {
    let consoleErrorSpy: jest.SpyInstance
    let consoleWarnSpy: jest.SpyInstance
    let consoleLogSpy: jest.SpyInstance

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
      consoleWarnSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })

    it('should log success when validation passes', () => {
      process.env.REQUIRED_VAR = 'value'

      validateAndLogEnvironment({
        required: ['REQUIRED_VAR']
      })

      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Environment validation passed')
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('should throw error when required variables are missing', () => {
      delete process.env.MISSING_VAR

      expect(() => {
        validateAndLogEnvironment({
          required: ['MISSING_VAR']
        })
      }).toThrow('Missing required environment variables: MISSING_VAR')

      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('should log warnings but not throw for optional variables', () => {
      delete process.env.OPTIONAL_VAR

      validateAndLogEnvironment({
        optional: ['OPTIONAL_VAR']
      })

      expect(consoleWarnSpy).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Environment validation passed')
    })

    it('should log all missing variables in error', () => {
      delete process.env.VAR1
      delete process.env.VAR2

      expect(() => {
        validateAndLogEnvironment({
          required: ['VAR1', 'VAR2']
        })
      }).toThrow()

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Environment validation failed!')
      expect(consoleErrorSpy).toHaveBeenCalledWith('Missing required environment variables:')
    })

    it('should log custom validation warnings', () => {
      validateAndLogEnvironment({
        validate: () => ['Custom warning message']
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️  Environment warnings:')
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Environment validation passed')
    })
  })
})
