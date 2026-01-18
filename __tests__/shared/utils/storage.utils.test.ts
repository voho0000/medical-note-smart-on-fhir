import { StorageService, localStorage as localStorageService, sessionStorage as sessionStorageService } from '@/src/shared/utils/storage.utils'

describe('storage.utils', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('StorageService - localStorage', () => {
    let storage: StorageService

    beforeEach(() => {
      storage = new StorageService('localStorage')
    })

    describe('get', () => {
      it('should get a stored value', () => {
        localStorage.setItem('test-key', JSON.stringify({ value: 'test' }))
        const result = storage.get<{ value: string }>('test-key')
        expect(result).toEqual({ value: 'test' })
      })

      it('should return default value if key does not exist', () => {
        const result = storage.get('non-existent', { default: true })
        expect(result).toEqual({ default: true })
      })

      it('should return null if key does not exist and no default provided', () => {
        const result = storage.get('non-existent')
        expect(result).toBeNull()
      })

      it('should handle JSON parse errors', () => {
        localStorage.setItem('invalid-json', 'not-valid-json{')
        const result = storage.get('invalid-json', { fallback: true })
        expect(result).toEqual({ fallback: true })
      })
    })

    describe('set', () => {
      it('should set a value', () => {
        const result = storage.set('test-key', { value: 'test' })
        expect(result).toBe(true)
        expect(localStorage.getItem('test-key')).toBe(JSON.stringify({ value: 'test' }))
      })

      it('should handle complex objects', () => {
        const complexObj = {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          boolean: true,
          null: null
        }
        storage.set('complex', complexObj)
        const retrieved = storage.get<typeof complexObj>('complex')
        expect(retrieved).toEqual(complexObj)
      })
    })

    describe('remove', () => {
      it('should remove a stored value', () => {
        localStorage.setItem('test-key', 'value')
        const result = storage.remove('test-key')
        expect(result).toBe(true)
        expect(localStorage.getItem('test-key')).toBeNull()
      })

      it('should return true even if key does not exist', () => {
        const result = storage.remove('non-existent')
        expect(result).toBe(true)
      })
    })

    describe('clear', () => {
      it('should clear all stored values', () => {
        localStorage.setItem('key1', 'value1')
        localStorage.setItem('key2', 'value2')
        const result = storage.clear()
        expect(result).toBe(true)
        expect(localStorage.length).toBe(0)
      })
    })
  })

  describe('StorageService - sessionStorage', () => {
    let storage: StorageService

    beforeEach(() => {
      storage = new StorageService('sessionStorage')
    })

    it('should use sessionStorage instead of localStorage', () => {
      storage.set('test-key', 'test-value')
      expect(sessionStorage.getItem('test-key')).toBe(JSON.stringify('test-value'))
      expect(localStorage.getItem('test-key')).toBeNull()
    })

    it('should get values from sessionStorage', () => {
      sessionStorage.setItem('test-key', JSON.stringify({ value: 'test' }))
      const result = storage.get<{ value: string }>('test-key')
      expect(result).toEqual({ value: 'test' })
    })
  })

  describe('exported instances', () => {
    it('should export localStorage instance', () => {
      localStorageService.set('test', 'value')
      expect(localStorage.getItem('test')).toBe(JSON.stringify('value'))
    })

    it('should export sessionStorage instance', () => {
      sessionStorageService.set('test', 'value')
      expect(sessionStorage.getItem('test')).toBe(JSON.stringify('value'))
    })

    it('should have separate storage instances', () => {
      localStorageService.set('key', 'local')
      sessionStorageService.set('key', 'session')
      expect(localStorage.getItem('key')).toBe(JSON.stringify('local'))
      expect(sessionStorage.getItem('key')).toBe(JSON.stringify('session'))
    })
  })
})
