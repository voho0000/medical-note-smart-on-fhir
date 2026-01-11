import { BaseError } from './base.error'

/**
 * FHIR Error Codes
 */
export enum FhirErrorCode {
  CLIENT_NOT_INITIALIZED = 'FHIR_CLIENT_NOT_INITIALIZED',
  AUTHENTICATION_FAILED = 'FHIR_AUTHENTICATION_FAILED',
  RESOURCE_NOT_FOUND = 'FHIR_RESOURCE_NOT_FOUND',
  INVALID_RESOURCE = 'FHIR_INVALID_RESOURCE',
  NETWORK_ERROR = 'FHIR_NETWORK_ERROR',
  SERVER_ERROR = 'FHIR_SERVER_ERROR',
  TIMEOUT = 'FHIR_TIMEOUT',
  UNKNOWN_ERROR = 'FHIR_UNKNOWN_ERROR',
}

/**
 * FHIR Service Error
 */
export class FhirError extends BaseError {
  constructor(
    message: string,
    code: FhirErrorCode,
    context?: Record<string, unknown>
  ) {
    super(message, code, context)
  }

  getUserMessage(): string {
    switch (this.code) {
      case FhirErrorCode.CLIENT_NOT_INITIALIZED:
        return 'FHIR client is not initialized. Please launch the app through SMART on FHIR.'
      case FhirErrorCode.AUTHENTICATION_FAILED:
        return 'Authentication failed. Please re-launch the app.'
      case FhirErrorCode.RESOURCE_NOT_FOUND:
        return 'Requested resource not found.'
      case FhirErrorCode.INVALID_RESOURCE:
        return 'Invalid FHIR resource format.'
      case FhirErrorCode.NETWORK_ERROR:
        return 'Network error occurred. Please check your connection.'
      case FhirErrorCode.SERVER_ERROR:
        return 'FHIR server error. Please try again later.'
      case FhirErrorCode.TIMEOUT:
        return 'Request timeout. Please try again.'
      default:
        return 'An unexpected error occurred while accessing patient data.'
    }
  }

  /**
   * Create FhirError from unknown error
   */
  static fromUnknown(error: unknown, context?: Record<string, unknown>): FhirError {
    if (error instanceof FhirError) {
      return error
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      
      if (message.includes('not found') || message.includes('404')) {
        return new FhirError(error.message, FhirErrorCode.RESOURCE_NOT_FOUND, context)
      }
      
      if (message.includes('unauthorized') || message.includes('401')) {
        return new FhirError(error.message, FhirErrorCode.AUTHENTICATION_FAILED, context)
      }
      
      if (message.includes('network') || message.includes('fetch')) {
        return new FhirError(error.message, FhirErrorCode.NETWORK_ERROR, context)
      }
      
      if (message.includes('timeout')) {
        return new FhirError(error.message, FhirErrorCode.TIMEOUT, context)
      }

      return new FhirError(error.message, FhirErrorCode.UNKNOWN_ERROR, {
        ...context,
        originalError: error.name,
      })
    }

    return new FhirError(
      'An unknown error occurred',
      FhirErrorCode.UNKNOWN_ERROR,
      { ...context, error: String(error) }
    )
  }
}
