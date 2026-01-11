import { BaseError } from './base.error'

/**
 * AI Service Error Codes
 */
export enum AiErrorCode {
  API_KEY_MISSING = 'AI_API_KEY_MISSING',
  API_KEY_INVALID = 'AI_API_KEY_INVALID',
  MODEL_NOT_FOUND = 'AI_MODEL_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'AI_RATE_LIMIT_EXCEEDED',
  NETWORK_ERROR = 'AI_NETWORK_ERROR',
  INVALID_REQUEST = 'AI_INVALID_REQUEST',
  STREAMING_ERROR = 'AI_STREAMING_ERROR',
  TIMEOUT = 'AI_TIMEOUT',
  UNKNOWN_ERROR = 'AI_UNKNOWN_ERROR',
}

/**
 * AI Service Error
 */
export class AiError extends BaseError {
  constructor(
    message: string,
    code: AiErrorCode,
    context?: Record<string, unknown>
  ) {
    super(message, code, context)
  }

  getUserMessage(): string {
    switch (this.code) {
      case AiErrorCode.API_KEY_MISSING:
        return 'AI API key is missing. Please configure your API key in settings.'
      case AiErrorCode.API_KEY_INVALID:
        return 'AI API key is invalid. Please check your API key in settings.'
      case AiErrorCode.MODEL_NOT_FOUND:
        return 'The selected AI model is not available. Please select a different model.'
      case AiErrorCode.RATE_LIMIT_EXCEEDED:
        return 'Rate limit exceeded. Please try again later.'
      case AiErrorCode.NETWORK_ERROR:
        return 'Network error occurred. Please check your internet connection.'
      case AiErrorCode.INVALID_REQUEST:
        return 'Invalid request. Please check your input and try again.'
      case AiErrorCode.STREAMING_ERROR:
        return 'Error occurred during streaming. Please try again.'
      case AiErrorCode.TIMEOUT:
        return 'Request timeout. Please try again.'
      default:
        return 'An unexpected error occurred. Please try again.'
    }
  }

  /**
   * Create AiError from unknown error
   */
  static fromUnknown(error: unknown, context?: Record<string, unknown>): AiError {
    if (error instanceof AiError) {
      return error
    }

    if (error instanceof Error) {
      // Parse common API error patterns
      const message = error.message.toLowerCase()
      
      if (message.includes('api key') || message.includes('unauthorized')) {
        return new AiError(error.message, AiErrorCode.API_KEY_INVALID, context)
      }
      
      if (message.includes('rate limit')) {
        return new AiError(error.message, AiErrorCode.RATE_LIMIT_EXCEEDED, context)
      }
      
      if (message.includes('network') || message.includes('fetch')) {
        return new AiError(error.message, AiErrorCode.NETWORK_ERROR, context)
      }
      
      if (message.includes('timeout')) {
        return new AiError(error.message, AiErrorCode.TIMEOUT, context)
      }

      return new AiError(error.message, AiErrorCode.UNKNOWN_ERROR, {
        ...context,
        originalError: error.name,
      })
    }

    return new AiError(
      'An unknown error occurred',
      AiErrorCode.UNKNOWN_ERROR,
      { ...context, error: String(error) }
    )
  }
}
