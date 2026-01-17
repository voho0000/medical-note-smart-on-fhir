/**
 * Logger Service
 * Centralized logging with environment-aware behavior
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: any
}

class LoggerService {
  private enableDebugLogs: boolean

  constructor() {
    // Only enable debug logs if explicitly set via localStorage or environment variable
    // This prevents debug logs from cluttering the console in normal usage
    if (typeof window !== 'undefined') {
      this.enableDebugLogs = localStorage.getItem('enableDebugLogs') === 'true'
    } else {
      this.enableDebugLogs = process.env.ENABLE_DEBUG_LOGS === 'true'
    }
  }

  /**
   * Debug level logging - disabled by default
   * Enable by setting localStorage.setItem('enableDebugLogs', 'true')
   */
  debug(message: string, context?: LogContext): void {
    if (this.enableDebugLogs) {
      console.log(`[DEBUG] ${message}`, context || '')
    }
  }

  /**
   * Info level logging - disabled by default
   * Enable by setting localStorage.setItem('enableDebugLogs', 'true')
   */
  info(message: string, context?: LogContext): void {
    if (this.enableDebugLogs) {
      console.log(`[INFO] ${message}`, context || '')
    }
  }

  /**
   * Warning level logging - always logged
   */
  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${message}`, context || '')
  }

  /**
   * Error level logging - always logged
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    console.error(`[ERROR] ${message}`, {
      error: error instanceof Error ? {
        message: error.message,
        stack: this.enableDebugLogs ? error.stack : undefined,
        name: error.name,
      } : error,
      ...context,
    })
  }

  /**
   * Create a scoped logger with a prefix
   */
  scope(prefix: string): ScopedLogger {
    return new ScopedLogger(this, prefix)
  }
}

class ScopedLogger {
  constructor(
    private logger: LoggerService,
    private prefix: string
  ) {}

  debug(message: string, context?: LogContext): void {
    this.logger.debug(`[${this.prefix}] ${message}`, context)
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(`[${this.prefix}] ${message}`, context)
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(`[${this.prefix}] ${message}`, context)
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.logger.error(`[${this.prefix}] ${message}`, error, context)
  }
}

// Export singleton instance
export const logger = new LoggerService()
