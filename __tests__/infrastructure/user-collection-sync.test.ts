const mockGetDocs = jest.fn()
const mockBatchDelete = jest.fn()
const mockBatchSet = jest.fn()
const mockBatchCommit = jest.fn()

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  deleteDoc: jest.fn(),
  doc: jest.fn((parent: { path: string }, id: string) => ({ path: `${parent.path}/${id}` })),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  onSnapshot: jest.fn(() => jest.fn()),
  orderBy: jest.fn((field: string, direction: string) => ({ field, direction })),
  query: jest.fn((...args: unknown[]) => ({ args })),
  setDoc: jest.fn(),
  Timestamp: { now: jest.fn(() => ({ seconds: 1 })) },
  writeBatch: jest.fn(() => ({
    delete: mockBatchDelete,
    set: mockBatchSet,
    commit: mockBatchCommit,
  })),
}))

jest.mock('@/src/shared/config/firebase.config', () => ({ db: { name: 'test-db' } }))

import { createUserCollectionSync } from '@/src/infrastructure/firebase/user-collection-sync'

type Item = { id: string; order: number; value: string }
type StoredItem = Item & { createdAt: { seconds: number }; updatedAt: { seconds: number } }

function createSync() {
  return createUserCollectionSync<Item, StoredItem>({
    collectionName: 'items',
    logLabel: 'Test Sync',
    nounSingular: 'item',
    nounPlural: 'items',
    getId: (item) => item.id,
    fromDoc: (id, data) => ({ id, order: data.order, value: data.value }),
    toDoc: (item, now) => ({ ...item, createdAt: now, updatedAt: now }),
    subscribeOrdering: { mode: 'query' },
  })
}

describe('createUserCollectionSync atomic writes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBatchCommit.mockResolvedValue(undefined)
  })

  it('commits deletes and upserts together', async () => {
    const sync = createSync()

    await expect(sync.applyChanges(
      'account-1',
      [{ id: 'keep', order: 0, value: 'updated' }],
      ['removed'],
    )).resolves.toBe(true)

    expect(mockBatchDelete).toHaveBeenCalledWith(expect.objectContaining({
      path: 'users/account-1/items/removed',
    }))
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/account-1/items/keep' }),
      expect.objectContaining({ id: 'keep', value: 'updated' }),
    )
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
  })

  it('does not treat a failed replace-all read as an empty collection', async () => {
    const sync = createSync()
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGetDocs.mockRejectedValueOnce(new Error('network unavailable'))

    await expect(sync.replaceAll(
      'account-1',
      [{ id: 'keep', order: 0, value: 'updated' }],
    )).resolves.toBe(false)

    expect(mockBatchCommit).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
