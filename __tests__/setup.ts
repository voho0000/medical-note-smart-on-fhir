// Jest Test Setup
// Global setup for all tests

import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  usePathname: () => '/',
}))

// Use real localStorage and sessionStorage for tests
class LocalStorageMock implements Storage {
  private store: Record<string, string> = {}

  get length(): number {
    return Object.keys(this.store).length
  }

  clear(): void {
    this.store = {}
  }

  getItem(key: string): string | null {
    return this.store[key] || null
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value)
  }

  removeItem(key: string): void {
    delete this.store[key]
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store)
    return keys[index] || null
  }
}

global.localStorage = new LocalStorageMock()
global.sessionStorage = new LocalStorageMock()

// Mock Web Crypto API for tests
if (!global.crypto) {
  const nodeCrypto = require('crypto')
  Object.defineProperty(global, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) => nodeCrypto.randomFillSync(arr),
      randomUUID: () => nodeCrypto.randomUUID(),
      subtle: nodeCrypto.webcrypto.subtle,
    },
  })
}

// Mock TextEncoder and TextDecoder for crypto tests
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util')
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder
}

// Mock fetch
global.fetch = jest.fn()

// Reset mocks and storage before each test
beforeEach(() => {
  jest.clearAllMocks()
  global.localStorage.clear()
  global.sessionStorage.clear()
  ;(global.fetch as jest.Mock).mockClear()
})
