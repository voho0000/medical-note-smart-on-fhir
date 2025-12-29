// Unit Tests: ServiceContainer
import { ServiceContainer } from '@/src/shared/di/service-container'

describe('ServiceContainer', () => {
  let container: ServiceContainer

  beforeEach(() => {
    container = ServiceContainer.getInstance()
    container.clear()
  })

  afterEach(() => {
    container.clear()
  })

  describe('register and resolve', () => {
    it('should register and resolve a service', () => {
      // Arrange
      const service = { name: 'TestService' }
      container.register('test', () => service)

      // Act
      const resolved = container.resolve('test')

      // Assert
      expect(resolved).toBe(service)
    })

    it('should throw error when resolving unregistered service', () => {
      // Act & Assert
      expect(() => container.resolve('nonexistent')).toThrow(
        "Service 'nonexistent' not found in container"
      )
    })

    it('should return same instance for singleton services', () => {
      // Arrange
      let callCount = 0
      container.register('singleton', () => {
        callCount++
        return { id: callCount }
      }, true)

      // Act
      const first = container.resolve('singleton')
      const second = container.resolve('singleton')

      // Assert
      expect(first).toBe(second)
      expect(callCount).toBe(1)
    })

    it('should return different instances for non-singleton services', () => {
      // Arrange
      let callCount = 0
      container.register('transient', () => {
        callCount++
        return { id: callCount }
      }, false)

      // Act
      const first = container.resolve<{ id: number }>('transient')
      const second = container.resolve<{ id: number }>('transient')

      // Assert
      expect(first).not.toBe(second)
      expect(first.id).toBe(1)
      expect(second.id).toBe(2)
      expect(callCount).toBe(2)
    })
  })

  describe('has', () => {
    it('should return true for registered service', () => {
      // Arrange
      container.register('test', () => ({}))

      // Act & Assert
      expect(container.has('test')).toBe(true)
    })

    it('should return false for unregistered service', () => {
      // Act & Assert
      expect(container.has('nonexistent')).toBe(false)
    })
  })

  describe('clearInstance', () => {
    it('should clear cached singleton instance', () => {
      // Arrange
      let callCount = 0
      container.register('singleton', () => {
        callCount++
        return { id: callCount }
      }, true)

      const first = container.resolve('singleton')
      
      // Act
      container.clearInstance('singleton')
      const second = container.resolve('singleton')

      // Assert
      expect(first).not.toBe(second)
      expect(callCount).toBe(2)
    })

    it('should not throw error when clearing non-existent service', () => {
      // Act & Assert
      expect(() => container.clearInstance('nonexistent')).not.toThrow()
    })
  })

  describe('clear', () => {
    it('should clear all registered services', () => {
      // Arrange
      container.register('service1', () => ({}))
      container.register('service2', () => ({}))

      // Act
      container.clear()

      // Assert
      expect(container.has('service1')).toBe(false)
      expect(container.has('service2')).toBe(false)
    })
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      // Act
      const instance1 = ServiceContainer.getInstance()
      const instance2 = ServiceContainer.getInstance()

      // Assert
      expect(instance1).toBe(instance2)
    })
  })
})
