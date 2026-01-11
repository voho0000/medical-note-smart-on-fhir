/**
 * Base Error Class
 * All custom errors should extend this class
 */
export abstract class BaseError extends Error {
  public readonly timestamp: Date
  public readonly code: string
  
  constructor(
    message: string,
    code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.timestamp = new Date()
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Convert error to a plain object for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    }
  }

  /**
   * Get user-friendly error message
   */
  abstract getUserMessage(): string
}
