import {
  isChunkLoadError,
  recoverFromChunkLoadError,
} from '@/src/shared/utils/chunk-load-recovery'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('chunk load recovery', () => {
  it.each([
    new Error('Failed to load chunk /app/_next/static/chunks/example.js from module 123'),
    new Error('Loading chunk 42 failed'),
    new TypeError('Failed to fetch dynamically imported module: https://example.test/chunk.js'),
    Object.assign(new Error('request failed'), { name: 'ChunkLoadError' }),
  ])('recognizes reloadable chunk failures', (error) => {
    expect(isChunkLoadError(error)).toBe(true)
  })

  it('does not treat an ordinary render error as a chunk failure', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
  })

  it('reloads once for the same chunk in a browser session', () => {
    const storage = createStorage()
    const reload = jest.fn()
    const environment = { storage, reload }
    const error = new Error('Failed to load chunk /app/_next/static/chunks/example.js from module 123')

    expect(recoverFromChunkLoadError(error, environment)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    expect(recoverFromChunkLoadError(error, environment)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('allows one recovery for a different versioned chunk', () => {
    const storage = createStorage()
    const reload = jest.fn()
    const environment = { storage, reload }

    recoverFromChunkLoadError(
      new Error('Failed to load chunk /app/_next/static/chunks/old.js'),
      environment,
    )

    expect(recoverFromChunkLoadError(
      new Error('Failed to load chunk /app/_next/static/chunks/new.js'),
      environment,
    )).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload when session storage cannot persist the loop guard', () => {
    const reload = jest.fn()
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('storage unavailable') },
    }

    expect(recoverFromChunkLoadError(
      new Error('Failed to load chunk /app/_next/static/chunks/example.js'),
      { storage, reload },
    )).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
