import { createAiResultStore } from '@/src/application/hooks/ai-generation/create-ai-result-store'
import { runGenerationJob } from '@/src/application/hooks/ai-generation/run-generation-job'
import { saveEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'

jest.mock('@/src/infrastructure/cache/encrypted-session-cache', () => ({
  saveEncryptedCache: jest.fn(),
}))

const mockedSaveEncryptedCache = jest.mocked(saveEncryptedCache)

describe('runGenerationJob cache ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('finishes the visible run without waiting for encryption', async () => {
    let finishSave!: () => void
    mockedSaveEncryptedCache.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishSave = resolve
    }))
    const store = createAiResultStore<{ value: string }>()

    const generated = await runGenerationJob({
      store,
      key: 'slot-a',
      cacheKey: 'cache-a',
      produce: async () => ({ value: 'generated' }),
    })

    expect(generated).toEqual({ value: 'generated' })
    expect(store.getState().running['slot-a']).toBe(false)
    expect(mockedSaveEncryptedCache).toHaveBeenCalledTimes(1)
    finishSave()
  })

  it('guards a late cache write against a newer result or Bundle revision', async () => {
    mockedSaveEncryptedCache.mockResolvedValueOnce(undefined)
    const store = createAiResultStore<{ value: string }>()

    const generated = await runGenerationJob({
      store,
      key: 'slot-a',
      cacheKey: 'cache-a',
      produce: async () => ({ value: 'generated' }),
    })
    const shouldCommit = mockedSaveEncryptedCache.mock.calls[0]?.[2]

    expect(shouldCommit).toBeDefined()
    expect(shouldCommit?.()).toBe(true)

    store.getState().setResult('slot-a', { value: 'newer' })
    expect(shouldCommit?.()).toBe(false)

    store.setState((state) => ({ bundleRevision: state.bundleRevision + 1 }))
    expect(shouldCommit?.()).toBe(false)
    expect(generated).toEqual({ value: 'generated' })
  })

  it('guards encryption that finishes after an already-committed run is cancelled', async () => {
    mockedSaveEncryptedCache.mockResolvedValueOnce(undefined)
    const store = createAiResultStore<{ value: string }>()
    let commit = true

    await runGenerationJob({
      store,
      key: 'slot-a',
      cacheKey: 'cache-a',
      produce: async () => ({ value: 'generated before companion cancellation' }),
      shouldCommit: () => commit,
    })
    const cacheGuard = mockedSaveEncryptedCache.mock.calls[0]?.[2]
    expect(cacheGuard?.()).toBe(true)

    commit = false
    expect(cacheGuard?.()).toBe(false)
  })

  it('silently discards a result invalidated by user cancellation', async () => {
    const store = createAiResultStore<{ value: string }>()
    let commit = true

    const generated = await runGenerationJob({
      store,
      key: 'slot-a',
      cacheKey: 'cache-a',
      produce: async () => {
        commit = false
        return { value: 'cancelled' }
      },
      shouldCommit: () => commit,
    })

    expect(generated).toBeNull()
    expect(store.getState().running['slot-a']).toBe(false)
    expect(store.getState().byKey['slot-a']).toBeUndefined()
    expect(store.getState().errors['slot-a']).toBeNull()
    expect(mockedSaveEncryptedCache).not.toHaveBeenCalled()
  })

  it('does not turn an abort rejection into a generation error', async () => {
    const store = createAiResultStore<{ value: string }>()
    let commit = true
    const abortError = new Error('signal is aborted without reason')
    abortError.name = 'AbortError'

    const generated = await runGenerationJob({
      store,
      key: 'slot-a',
      cacheKey: 'cache-a',
      produce: async () => {
        commit = false
        throw abortError
      },
      shouldCommit: () => commit,
    })

    expect(generated).toBeNull()
    expect(store.getState().running['slot-a']).toBe(false)
    expect(store.getState().errors['slot-a']).toBeNull()
    expect(mockedSaveEncryptedCache).not.toHaveBeenCalled()
  })
})
