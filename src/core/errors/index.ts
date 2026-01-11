/**
 * Centralized Error Handling
 * Export all error classes and utilities
 */

export { BaseError } from './base.error'
export { AiError, AiErrorCode } from './ai.error'
export { FhirError, FhirErrorCode } from './fhir.error'
export { ValidationError, ValidationErrorCode } from './validation.error'

import type { BaseError } from './base.error'

/**
 * Type guard to check if error is a BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return error !== null && 
         typeof error === 'object' && 
         'getUserMessage' in error &&
         'toJSON' in error
}

/**
 * Extract user-friendly message from any error
 */
export function getUserErrorMessage(error: unknown): string {
  if (isBaseError(error)) {
    return error.getUserMessage()
  }
  
  if (error instanceof Error) {
    return error.message
  }
  
  return 'An unexpected error occurred'
}

/**
 * Log error with context
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  if (isBaseError(error)) {
    console.error('[Error]', error.toJSON())
  } else if (error instanceof Error) {
    console.error('[Error]', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
    })
  } else {
    console.error('[Error]', { error: String(error), context })
  }
}
