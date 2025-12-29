// Dependency Injection Container
// Provides centralized service management and dependency injection

type ServiceFactory<T> = () => T
type ServiceInstance<T> = T

interface ServiceDefinition<T> {
  factory: ServiceFactory<T>
  singleton: boolean
  instance?: ServiceInstance<T>
}

export class ServiceContainer {
  private static instance: ServiceContainer
  private services = new Map<string, ServiceDefinition<any>>()

  private constructor() {}

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer()
    }
    return ServiceContainer.instance
  }

  /**
   * Register a service with the container
   * @param key - Unique identifier for the service
   * @param factory - Factory function to create the service
   * @param singleton - Whether to cache the instance (default: true)
   */
  register<T>(key: string, factory: ServiceFactory<T>, singleton: boolean = true): void {
    this.services.set(key, { factory, singleton })
  }

  /**
   * Resolve a service from the container
   * @param key - Unique identifier for the service
   * @returns The service instance
   */
  resolve<T>(key: string): T {
    const definition = this.services.get(key)
    
    if (!definition) {
      throw new Error(`Service '${key}' not found in container. Did you forget to register it?`)
    }

    // Return cached instance for singletons
    if (definition.singleton && definition.instance) {
      return definition.instance as T
    }

    // Create new instance
    const instance = definition.factory()

    // Cache for singletons
    if (definition.singleton) {
      definition.instance = instance
    }

    return instance as T
  }

  /**
   * Check if a service is registered
   * @param key - Unique identifier for the service
   */
  has(key: string): boolean {
    return this.services.has(key)
  }

  /**
   * Clear all registered services (useful for testing)
   */
  clear(): void {
    this.services.clear()
  }

  /**
   * Clear a specific service instance (useful for testing)
   * @param key - Unique identifier for the service
   */
  clearInstance(key: string): void {
    const definition = this.services.get(key)
    if (definition) {
      delete definition.instance
    }
  }
}

// Export singleton instance for convenience
export const container = ServiceContainer.getInstance()
