import { BaseError } from './base.error'

/**
 * Validation Error Codes
 */
export enum ValidationErrorCode {
  REQUIRED_FIELD_MISSING = 'VALIDATION_REQUIRED_FIELD_MISSING',
  INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  OUT_OF_RANGE = 'VALIDATION_OUT_OF_RANGE',
  INVALID_TYPE = 'VALIDATION_INVALID_TYPE',
  UNKNOWN_ERROR = 'VALIDATION_UNKNOWN_ERROR',
}

/**
 * Validation Error
 */
export class ValidationError extends BaseError {
  constructor(
    message: string,
    code: ValidationErrorCode,
    public readonly field?: string,
    context?: Record<string, unknown>
  ) {
    super(message, code, { ...context, field })
  }

  getUserMessage(): string {
    const fieldName = this.field ? ` (${this.field})` : ''
    
    switch (this.code) {
      case ValidationErrorCode.REQUIRED_FIELD_MISSING:
        return `Required field is missing${fieldName}.`
      case ValidationErrorCode.INVALID_FORMAT:
        return `Invalid format${fieldName}.`
      case ValidationErrorCode.OUT_OF_RANGE:
        return `Value is out of range${fieldName}.`
      case ValidationErrorCode.INVALID_TYPE:
        return `Invalid type${fieldName}.`
      default:
        return `Validation error${fieldName}.`
    }
  }
}
