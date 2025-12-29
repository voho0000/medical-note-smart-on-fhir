// Storage Utilities
export type StorageType = 'localStorage' | 'sessionStorage'

export class StorageService {
  private storage: Storage | null = null

  constructor(private storageType: StorageType = 'localStorage') {
    if (typeof window !== 'undefined') {
      this.storage = window[storageType]
    }
  }

  get<T>(key: string, defaultValue?: T): T | null {
    if (!this.storage) return defaultValue ?? null
    
    try {
      const item = this.storage.getItem(key)
      if (item === null) return defaultValue ?? null
      return JSON.parse(item) as T
    } catch (error) {
      console.error(`Failed to get item from ${this.storageType}:`, error)
      return defaultValue ?? null
    }
  }

  set<T>(key: string, value: T): boolean {
    if (!this.storage) return false
    
    try {
      this.storage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.error(`Failed to set item in ${this.storageType}:`, error)
      return false
    }
  }

  remove(key: string): boolean {
    if (!this.storage) return false
    
    try {
      this.storage.removeItem(key)
      return true
    } catch (error) {
      console.error(`Failed to remove item from ${this.storageType}:`, error)
      return false
    }
  }

  clear(): boolean {
    if (!this.storage) return false
    
    try {
      this.storage.clear()
      return true
    } catch (error) {
      console.error(`Failed to clear ${this.storageType}:`, error)
      return false
    }
  }
}

export const localStorage = new StorageService('localStorage')
export const sessionStorage = new StorageService('sessionStorage')
