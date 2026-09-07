import { syncBetaFeaturesForAccount } from '@/src/application/services/beta-features-sync'
import { useBetaFeaturesStore } from '@/src/application/stores/beta-features.store'
import { db } from '@/src/shared/config/firebase.config'
import { doc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore'

jest.mock('@/src/shared/config/firebase.config', () => ({ db: {} }))
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...path) => path.join('/')),
  onSnapshot: jest.fn(),
  runTransaction: jest.fn(),
  setDoc: jest.fn(),
}))

const store = useBetaFeaturesStore
const setLocal = (id: string, enabled: boolean) => store.getState().setBetaFeaturesEnabled(id, enabled)
const read = (id = 'a') => store.getState().enabledByUser[id]
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
const snapshot = (value?: boolean, fromCache = false, hasPendingWrites = false) => ({
  metadata: { fromCache, hasPendingWrites },
  data: () => value === undefined ? undefined : { preferences: { betaFeaturesEnabled: value } },
})
let emit: (value: ReturnType<typeof snapshot>) => void
let fail: () => void
let stop: () => void
let unsubscribe: jest.Mock
let transaction: { get: jest.Mock; set: jest.Mock }

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  store.setState({ enabledByUser: {}, syncErrors: {} })
  unsubscribe = jest.fn()
  ;(onSnapshot as jest.Mock).mockImplementation((_ref, _options, next, error) => {
    emit = next
    fail = error
    return unsubscribe
  })
  ;(setDoc as jest.Mock).mockResolvedValue(undefined)
  transaction = { get: jest.fn().mockResolvedValue(snapshot()), set: jest.fn() }
  ;(runTransaction as jest.Mock).mockImplementation(async (_db, body) => body(transaction))
})
afterEach(() => stop?.())

it.each([true, false])('restores account value %s in a fresh browser without echoing a write', (value) => {
  stop = syncBetaFeaturesForAccount('a')
  emit(snapshot(value))
  expect(read()).toBe(value)
  expect(setDoc).not.toHaveBeenCalled()
  expect(runTransaction).not.toHaveBeenCalled()
  expect(doc).toHaveBeenCalledWith(db, 'users', 'a')
})

it('uses the cloud answer over a stale browser answer', () => {
  setLocal('a', true)
  stop = syncBetaFeaturesForAccount('a')
  emit(snapshot(false))
  expect(read()).toBe(false)
  expect(setDoc).not.toHaveBeenCalled()
})

it('saves both on and off with a merge that preserves other profile fields', async () => {
  stop = syncBetaFeaturesForAccount('a')
  setLocal('a', true)
  setLocal('a', false)
  await flush()
  expect(setDoc).toHaveBeenNthCalledWith(1, 'users/a', { preferences: { betaFeaturesEnabled: true } }, { merge: true })
  expect(setDoc).toHaveBeenNthCalledWith(2, 'users/a', { preferences: { betaFeaturesEnabled: false } }, { merge: true })
  expect(read()).toBe(false)
})

it.each([true, false])('migrates an existing local account preference %s only after a server read', async (value) => {
  setLocal('a', value)
  stop = syncBetaFeaturesForAccount('a')
  emit(snapshot(undefined, true))
  expect(runTransaction).not.toHaveBeenCalled()
  emit(snapshot())
  await flush()
  expect(transaction.set).toHaveBeenCalledWith('users/a', { preferences: { betaFeaturesEnabled: value } }, { merge: true })
  emit(snapshot())
  expect(runTransaction).toHaveBeenCalledTimes(1)
})

it('does not migrate another account or guest preference into a new account', () => {
  setLocal('guest', true)
  setLocal('anonymous', true)
  setLocal('b', true)
  stop = syncBetaFeaturesForAccount('a')
  emit(snapshot())
  expect(read()).toBeUndefined()
  expect(runTransaction).not.toHaveBeenCalled()
  expect(setDoc).not.toHaveBeenCalled()
})

it('does not overwrite a preference saved by another device during migration', async () => {
  setLocal('a', true)
  transaction.get.mockResolvedValue(snapshot(false))
  stop = syncBetaFeaturesForAccount('a')
  emit(snapshot())
  await flush()
  expect(transaction.set).not.toHaveBeenCalled()
  emit(snapshot(false))
  expect(read()).toBe(false)
})

it('does not migrate a stale value when the user toggles during the transaction', async () => {
  let resolveRead!: (value: ReturnType<typeof snapshot>) => void
  transaction.get.mockImplementation(() => new Promise((resolve) => { resolveRead = resolve }))
  setLocal('a', true)
  stop = syncBetaFeaturesForAccount('a')
  emit(snapshot())
  setLocal('a', false)
  resolveRead(snapshot())
  await flush()
  expect(transaction.set).not.toHaveBeenCalled()
  expect(read()).toBe(false)
})

it('keeps the latest toggle while writes are pending and accepts later remote updates', async () => {
  let finish!: () => void
  ;(setDoc as jest.Mock).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
  stop = syncBetaFeaturesForAccount('a')
  setLocal('a', true)
  emit(snapshot(false))
  expect(read()).toBe(true)
  emit(snapshot(true, false, true))
  emit(snapshot(true))
  finish()
  await flush()
  expect(read()).toBe(true)
  emit(snapshot(false))
  expect(read()).toBe(false)
  expect(setDoc).toHaveBeenCalledTimes(1)
})

it('stops reading and writing the previous account after logout or account switching', () => {
  stop = syncBetaFeaturesForAccount('a')
  const oldEmit = emit
  stop()
  expect(unsubscribe).toHaveBeenCalled()
  stop = syncBetaFeaturesForAccount('b')
  oldEmit(snapshot(true))
  setLocal('a', false)
  setLocal('guest', true)
  expect(setDoc).not.toHaveBeenCalled()
  expect(read()).toBe(false)
  emit(snapshot(true))
  expect(read('b')).toBe(true)
  setLocal('b', false)
  expect(setDoc).toHaveBeenCalledWith('users/b', { preferences: { betaFeaturesEnabled: false } }, { merge: true })
})

it('reports failures and retains the browser choice when a write is rejected', async () => {
  ;(setDoc as jest.Mock).mockRejectedValue(new Error('permission denied'))
  stop = syncBetaFeaturesForAccount('a')
  setLocal('a', true)
  await flush()
  expect(read()).toBe(true)
  expect(store.getState().syncErrors.a).toBe(true)
  emit(snapshot(false))
  expect(read()).toBe(true)
  expect(store.getState().syncErrors.a).toBe(true)
  expect(JSON.parse(localStorage.getItem('mediprisma-beta-features')!).state.syncErrors).toBeUndefined()
  ;(setDoc as jest.Mock).mockResolvedValue(undefined)
  setLocal('a', false)
  await flush()
  expect(store.getState().syncErrors.a).toBe(false)
})

it('reports a failed account read without changing the saved choice', () => {
  setLocal('a', true)
  stop = syncBetaFeaturesForAccount('a')
  fail()
  expect(read()).toBe(true)
  expect(store.getState().syncErrors.a).toBe(true)
})
