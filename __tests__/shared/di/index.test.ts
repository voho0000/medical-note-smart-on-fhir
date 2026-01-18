import { ServiceContainer, container, ServiceKeys, registerServices } from '@/src/shared/di'

describe('DI index', () => {
  it('should export ServiceContainer', () => {
    expect(ServiceContainer).toBeDefined()
  })

  it('should export container instance', () => {
    expect(container).toBeDefined()
    expect(container).toBeInstanceOf(ServiceContainer)
  })

  it('should export ServiceKeys', () => {
    expect(ServiceKeys).toBeDefined()
  })

  it('should export registerServices', () => {
    expect(registerServices).toBeDefined()
    expect(typeof registerServices).toBe('function')
  })
})
