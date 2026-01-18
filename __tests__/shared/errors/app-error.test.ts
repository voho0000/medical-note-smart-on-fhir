import {
  AppError,
  NetworkError,
  AuthError,
  ValidationError,
  FhirError,
  FirebaseError,
  AIServiceError,
  ErrorCode,
  getErrorCode
} from '@/src/shared/errors/app-error'

describe('app-error', () => {
  describe('AppError', () => {
    it('should create an error with code and message', () => {
      const error = new AppError(ErrorCode.UNKNOWN_ERROR, 'Test error')
      
      expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR)
      expect(error.message).toBe('Test error')
      expect(error.name).toBe('AppError')
    })

    it('should create an error with details', () => {
      const details = { userId: '123', action: 'test' }
      const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Validation failed', details)
      
      expect(error.details).toEqual(details)
    })

    it('should serialize to JSON', () => {
      const error = new AppError(ErrorCode.NETWORK_ERROR, 'Network failed', { status: 500 })
      const json = error.toJSON()
      
      expect(json).toEqual({
        name: 'AppError',
        code: ErrorCode.NETWORK_ERROR,
        message: 'Network failed',
        details: { status: 500 }
      })
    })

    it('should have proper stack trace', () => {
      const error = new AppError(ErrorCode.UNKNOWN_ERROR, 'Test')
      expect(error.stack).toBeDefined()
    })
  })

  describe('NetworkError', () => {
    it('should create a network error', () => {
      const error = new NetworkError('Connection failed')
      
      expect(error.name).toBe('NetworkError')
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR)
      expect(error.message).toBe('Connection failed')
    })

    it('should accept details', () => {
      const details = { url: 'https://api.example.com' }
      const error = new NetworkError('Request failed', details)
      
      expect(error.details).toEqual(details)
    })
  })

  describe('AuthError', () => {
    it('should create an auth error', () => {
      const error = new AuthError('Authentication failed')
      
      expect(error.name).toBe('AuthError')
      expect(error.code).toBe(ErrorCode.AUTH_FAILED)
      expect(error.message).toBe('Authentication failed')
    })
  })

  describe('ValidationError', () => {
    it('should create a validation error', () => {
      const error = new ValidationError('Invalid input')
      
      expect(error.name).toBe('ValidationError')
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(error.message).toBe('Invalid input')
    })
  })

  describe('FhirError', () => {
    it('should create a FHIR error', () => {
      const error = new FhirError('FHIR server error')
      
      expect(error.name).toBe('FhirError')
      expect(error.code).toBe(ErrorCode.FHIR_SERVER_ERROR)
      expect(error.message).toBe('FHIR server error')
    })
  })

  describe('FirebaseError', () => {
    it('should create a Firebase error', () => {
      const error = new FirebaseError('Firebase operation failed')
      
      expect(error.name).toBe('FirebaseError')
      expect(error.code).toBe(ErrorCode.FIREBASE_ERROR)
      expect(error.message).toBe('Firebase operation failed')
    })
  })

  describe('AIServiceError', () => {
    it('should create an AI service error', () => {
      const error = new AIServiceError('AI request failed')
      
      expect(error.name).toBe('AIServiceError')
      expect(error.code).toBe(ErrorCode.AI_SERVICE_ERROR)
      expect(error.message).toBe('AI request failed')
    })
  })

  describe('getErrorCode', () => {
    it('should return error code from AppError', () => {
      const error = new AppError(ErrorCode.NETWORK_ERROR, 'Test')
      expect(getErrorCode(error)).toBe(ErrorCode.NETWORK_ERROR)
    })

    it('should return error code from subclass', () => {
      const error = new NetworkError('Test')
      expect(getErrorCode(error)).toBe(ErrorCode.NETWORK_ERROR)
    })

    it('should return UNKNOWN_ERROR for non-AppError', () => {
      const error = new Error('Regular error')
      expect(getErrorCode(error)).toBe(ErrorCode.UNKNOWN_ERROR)
    })

    it('should return UNKNOWN_ERROR for unknown types', () => {
      expect(getErrorCode('string error')).toBe(ErrorCode.UNKNOWN_ERROR)
      expect(getErrorCode(null)).toBe(ErrorCode.UNKNOWN_ERROR)
      expect(getErrorCode(undefined)).toBe(ErrorCode.UNKNOWN_ERROR)
      expect(getErrorCode(123)).toBe(ErrorCode.UNKNOWN_ERROR)
    })
  })

  describe('ErrorCode enum', () => {
    it('should have all error codes defined', () => {
      expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR')
      expect(ErrorCode.TIMEOUT_ERROR).toBe('TIMEOUT_ERROR')
      expect(ErrorCode.AUTH_REQUIRED).toBe('AUTH_REQUIRED')
      expect(ErrorCode.AUTH_FAILED).toBe('AUTH_FAILED')
      expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED')
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT')
      expect(ErrorCode.FHIR_SERVER_ERROR).toBe('FHIR_SERVER_ERROR')
      expect(ErrorCode.FHIR_RESOURCE_NOT_FOUND).toBe('FHIR_RESOURCE_NOT_FOUND')
      expect(ErrorCode.FIREBASE_ERROR).toBe('FIREBASE_ERROR')
      expect(ErrorCode.FIRESTORE_ERROR).toBe('FIRESTORE_ERROR')
      expect(ErrorCode.AI_SERVICE_ERROR).toBe('AI_SERVICE_ERROR')
      expect(ErrorCode.AI_QUOTA_EXCEEDED).toBe('AI_QUOTA_EXCEEDED')
      expect(ErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR')
    })
  })
})
