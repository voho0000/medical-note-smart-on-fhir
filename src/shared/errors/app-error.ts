/**
 * Application Error Classes
 * Centralized error handling with typed error categories
 */

export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Authentication errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_FAILED = 'AUTH_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // FHIR errors
  FHIR_SERVER_ERROR = 'FHIR_SERVER_ERROR',
  FHIR_RESOURCE_NOT_FOUND = 'FHIR_RESOURCE_NOT_FOUND',
  
  // Firebase errors
  FIREBASE_ERROR = 'FIREBASE_ERROR',
  FIRESTORE_ERROR = 'FIRESTORE_ERROR',
  
  // AI errors
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',
  
  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'AppError'
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

export class NetworkError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(ErrorCode.NETWORK_ERROR, message, details)
    this.name = 'NetworkError'
  }
}

export class AuthError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(ErrorCode.AUTH_FAILED, message, details)
    this.name = 'AuthError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(ErrorCode.VALIDATION_ERROR, message, details)
    this.name = 'ValidationError'
  }
}

export class FhirError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(ErrorCode.FHIR_SERVER_ERROR, message, details)
    this.name = 'FhirError'
  }
}

export class FirebaseError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(ErrorCode.FIREBASE_ERROR, message, details)
    this.name = 'FirebaseError'
  }
}

export class AIServiceError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(ErrorCode.AI_SERVICE_ERROR, message, details)
    this.name = 'AIServiceError'
  }
}

/**
 * Get error code for i18n lookup
 * Error messages should be managed in i18n files (e.g., zh-TW.ts)
 * Use pattern: errors.{errorCode} for translation keys
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (error instanceof AppError) {
    return error.code
  }
  return ErrorCode.UNKNOWN_ERROR
}
