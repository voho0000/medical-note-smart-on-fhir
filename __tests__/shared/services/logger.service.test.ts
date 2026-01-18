import { logger } from '@/src/shared/services/logger.service'

describe('logger.service', () => {
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    localStorage.removeItem('enableDebugLogs')
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('debug', () => {
    it('should not log when debug is disabled', () => {
      logger.debug('Test message')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should log when debug is enabled', () => {
      localStorage.setItem('enableDebugLogs', 'true')
      const newLogger = new (logger.constructor as any)()
      newLogger.debug('Test message')
      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] Test message', '')
    })

    it('should log with context', () => {
      localStorage.setItem('enableDebugLogs', 'true')
      const newLogger = new (logger.constructor as any)()
      const context = { userId: '123' }
      newLogger.debug('Test message', context)
      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] Test message', context)
    })
  })

  describe('info', () => {
    it('should not log when debug is disabled', () => {
      logger.info('Test message')
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should log when debug is enabled', () => {
      localStorage.setItem('enableDebugLogs', 'true')
      const newLogger = new (logger.constructor as any)()
      newLogger.info('Test message')
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] Test message', '')
    })

    it('should log with context', () => {
      localStorage.setItem('enableDebugLogs', 'true')
      const newLogger = new (logger.constructor as any)()
      const context = { action: 'test' }
      newLogger.info('Test message', context)
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] Test message', context)
    })
  })

  describe('warn', () => {
    it('should always log warnings', () => {
      logger.warn('Warning message')
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] Warning message', '')
    })

    it('should log with context', () => {
      const context = { code: 'WARN_001' }
      logger.warn('Warning message', context)
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] Warning message', context)
    })
  })

  describe('error', () => {
    it('should always log errors', () => {
      logger.error('Error message')
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Error message', {})
    })

    it('should log with Error object', () => {
      const error = new Error('Test error')
      logger.error('Error occurred', error)
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Error occurred', {
        error: {
          message: 'Test error',
          stack: undefined,
          name: 'Error'
        }
      })
    })

    it('should include stack trace when debug is enabled', () => {
      localStorage.setItem('enableDebugLogs', 'true')
      const newLogger = new (logger.constructor as any)()
      const error = new Error('Test error')
      newLogger.error('Error occurred', error)
      
      const call = consoleErrorSpy.mock.calls[0]
      expect(call[1].error.stack).toBeDefined()
    })

    it('should log with context', () => {
      const error = new Error('Test error')
      const context = { userId: '123', action: 'test' }
      logger.error('Error occurred', error, context)
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Error occurred', {
        error: {
          message: 'Test error',
          stack: undefined,
          name: 'Error'
        },
        userId: '123',
        action: 'test'
      })
    })

    it('should handle non-Error objects', () => {
      logger.error('Error occurred', 'string error')
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Error occurred', {
        error: 'string error'
      })
    })
  })

  describe('scope', () => {
    it('should create a scoped logger', () => {
      const scopedLogger = logger.scope('TestScope')
      expect(scopedLogger).toBeDefined()
    })

    it('should prefix debug messages', () => {
      localStorage.setItem('enableDebugLogs', 'true')
      const newLogger = new (logger.constructor as any)()
      const scopedLogger = newLogger.scope('TestScope')
      scopedLogger.debug('Test message')
      
      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] [TestScope] Test message', '')
    })

    it('should prefix info messages', () => {
      localStorage.setItem('enableDebugLogs', 'true')
      const newLogger = new (logger.constructor as any)()
      const scopedLogger = newLogger.scope('TestScope')
      scopedLogger.info('Test message')
      
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] [TestScope] Test message', '')
    })

    it('should prefix warn messages', () => {
      const scopedLogger = logger.scope('TestScope')
      scopedLogger.warn('Warning message')
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] [TestScope] Warning message', '')
    })

    it('should prefix error messages', () => {
      const scopedLogger = logger.scope('TestScope')
      const error = new Error('Test error')
      scopedLogger.error('Error occurred', error)
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] [TestScope] Error occurred', {
        error: {
          message: 'Test error',
          stack: undefined,
          name: 'Error'
        }
      })
    })
  })
})
