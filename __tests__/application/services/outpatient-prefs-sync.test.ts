import {
  MAX_SYNCED_CHARS,
  mergeOutpatientPrefs,
  syncOutpatientPrefsForAccount,
} from '@/src/application/services/outpatient-prefs-sync'
import {
  EMPTY_OUTPATIENT_PREFS,
  useOutpatientPrefsStore,
  type EmrCustomFormat,
  type OutpatientPrefs,
} from '@/src/application/stores/outpatient-prefs.store'
import { doc, onSnapshot, runTransaction } from 'firebase/firestore'

jest.mock('@/src/shared/config/firebase.config', () => ({ db: {} }))
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...path) => path.join('/')),
  onSnapshot: jest.fn(),
  runTransaction: jest.fn(),
}))

const store = useOutpatientPrefsStore
const format = (id: string, name = id): EmrCustomFormat => ({
  id,
  name,
  tokens: [{ kind: 'text', text: name }],
  labRule: 'sameDay',
  missingText: '—',
  dateStyle: 'md',
  emptyLines: 'omit',
})
const prefs = (patch: Partial<OutpatientPrefs>): OutpatientPrefs => ({ ...EMPTY_OUTPATIENT_PREFS, ...patch })
const remoteField = (patch: Partial<OutpatientPrefs>, updatedAt: number) => ({ ...prefs(patch), updatedAt })
const snapshot = (field?: object, fromCache = false, hasPendingWrites = false) => ({
  metadata: { fromCache, hasPendingWrites },
  data: () => (field === undefined ? { email: 'doc@example.org' } : { email: 'doc@example.org', outpatientPrefs: field }),
})
const local = (key = 'a') => store.getState().byUser[key]
const meta = (key = 'a') => store.getState().syncMeta[key]
const status = (key = 'a') => store.getState().syncStatus[key]
const settle = async () => { await jest.advanceTimersByTimeAsync(1000) }

let emit: (value: ReturnType<typeof snapshot>) => void
let fail: (error: Error) => void
let unsubscribe: jest.Mock
let stop: (() => void) | undefined
/** What the account holds, as the transaction reads it. */
let account: object | undefined
let transaction: { get: jest.Mock; set: jest.Mock }

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  localStorage.clear()
  store.setState({ byUser: {}, syncMeta: {}, syncStatus: {} })
  account = undefined
  unsubscribe = jest.fn()
  ;(onSnapshot as jest.Mock).mockImplementation((_ref, _options, next, error) => {
    emit = next
    fail = error
    return unsubscribe
  })
  transaction = {
    get: jest.fn(async () => snapshot(account)),
    set: jest.fn((_ref, data) => { account = data.outpatientPrefs }),
  }
  ;(runTransaction as jest.Mock).mockImplementation(async (_db, body) => body(transaction))
})
afterEach(() => {
  stop?.()
  stop = undefined
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it('restores the account settings in a fresh browser without writing them back', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({ pinnedLabs: ['chem:CREA'], formats: [format('f1')] }, 100)))
  await settle()
  expect(local()?.pinnedLabs).toEqual(['chem:CREA'])
  expect(local()?.formats.map((f) => f.id)).toEqual(['f1'])
  expect(meta()).toEqual({ updatedAt: 100, dirty: false, baseUpdatedAt: 100 })
  expect(runTransaction).not.toHaveBeenCalled()
  expect(doc).toHaveBeenCalledWith({}, 'users', 'a')
})

it('saves an edit to the account field only, leaving the profile alone', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({}, 100)))
  await settle()
  store.getState().update('a', { pinnedLabs: ['chem:K'] })
  expect(meta()?.dirty).toBe(true)
  await settle()
  expect(transaction.set).toHaveBeenCalledTimes(1)
  const [ref, data, options] = transaction.set.mock.calls[0]
  expect(ref).toBe('users/a')
  expect(options).toEqual({ mergeFields: ['outpatientPrefs'] })
  expect(data.outpatientPrefs.pinnedLabs).toEqual(['chem:K'])
  expect(Object.keys(data)).toEqual(['outpatientPrefs'])
  expect(meta()).toMatchObject({ dirty: false, baseUpdatedAt: data.outpatientPrefs.updatedAt })
  expect(status()).toBe('synced')
})

it('waits for a burst of edits and saves once', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({}, 100)))
  store.getState().update('a', { labMode: 'abnormal' })
  store.getState().update('a', { labMode: 'mine' })
  store.getState().update('a', { pinnedLabs: ['chem:CREA'] })
  await settle()
  expect(transaction.set).toHaveBeenCalledTimes(1)
  expect(account).toMatchObject({ labMode: 'mine', pinnedLabs: ['chem:CREA'] })
})

it('takes a change saved on another device while this one has nothing unsaved', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({ pinnedLabs: ['chem:CREA'] }, 100)))
  await settle()
  emit(snapshot(remoteField({ pinnedLabs: ['chem:CREA', 'chem:K'], formats: [format('f2')] }, 200)))
  await settle()
  expect(local()?.pinnedLabs).toEqual(['chem:CREA', 'chem:K'])
  expect(local()?.formats.map((f) => f.id)).toEqual(['f2'])
  expect(runTransaction).not.toHaveBeenCalled()
})

it('ignores cached and not-yet-committed snapshots', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({ pinnedLabs: ['chem:CREA'] }, 100), true))
  emit(snapshot(remoteField({ pinnedLabs: ['chem:K'] }, 100), false, true))
  await settle()
  expect(local()).toBeUndefined()
})

it('carries this account’s own settings from before sync into an empty account', async () => {
  // Saved by the previous build: settings, no sync bookkeeping.
  store.setState({ byUser: { a: prefs({ pinnedLabs: ['chem:CREA'], formats: [format('f1')] }) }, syncMeta: {} })
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot())
  await settle()
  expect(account).toMatchObject({ pinnedLabs: ['chem:CREA'] })
  expect((account as { formats: EmrCustomFormat[] }).formats.map((f) => f.id)).toEqual(['f1'])
  expect(meta()?.dirty).toBe(false)
})

it('never carries guest, anonymous or another account’s settings into an account', async () => {
  store.getState().update('guest', { formats: [format('guest-format')] })
  store.getState().update('anon-uid', { pinnedLabs: ['chem:K'] })
  store.getState().update('b', { pinnedLabs: ['chem:ALT'] })
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot())
  await settle()
  expect(runTransaction).not.toHaveBeenCalled()
  expect(local()).toBeUndefined()
  expect(local('guest')?.formats.map((f) => f.id)).toEqual(['guest-format'])
})

it('on the first sync here, keeps the account’s choices and adds formats made here', async () => {
  store.setState({
    byUser: { a: prefs({ pinnedLabs: ['chem:ALT'], formats: [format('here')], labMode: 'all' }) },
    syncMeta: {},
  })
  account = remoteField({ pinnedLabs: ['chem:CREA'], formats: [format('there')], labMode: 'mine' }, 100)
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(account))
  await settle()
  expect(local()?.pinnedLabs).toEqual(['chem:CREA'])
  expect(local()?.labMode).toBe('mine')
  expect(local()?.formats.map((f) => f.id)).toEqual(['there', 'here'])
  expect((account as { formats: EmrCustomFormat[] }).formats.map((f) => f.id)).toEqual(['there', 'here'])
  expect(meta()?.dirty).toBe(false)
})

it('merges when both devices changed: every format kept, the newer choice wins', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({ pinnedLabs: ['chem:CREA'], formats: [format('f1')] }, 100)))
  await settle()
  // Another device adds a format while this one edits the pinned list.
  account = remoteField({ pinnedLabs: ['chem:CREA'], formats: [format('f1'), format('other-device')] }, 150)
  jest.setSystemTime(10_000)
  store.getState().update('a', { pinnedLabs: ['chem:K'], formats: [format('f1'), format('this-device')] })
  await settle()
  const saved = account as OutpatientPrefs & { updatedAt: number }
  expect(saved.pinnedLabs).toEqual(['chem:K'])
  expect(saved.formats.map((f) => f.id)).toEqual(['f1', 'this-device', 'other-device'])
  expect(local()?.formats.map((f) => f.id)).toEqual(['f1', 'this-device', 'other-device'])
  expect(meta()).toMatchObject({ dirty: false, baseUpdatedAt: saved.updatedAt })
})

it('sends an edit left unsaved by a closed tab or an outage when the account is next read', async () => {
  store.getState().update('a', { pinnedLabs: ['chem:ALT'] })
  store.getState().setSyncMeta('a', { ...meta()!, baseUpdatedAt: 100 })
  account = remoteField({ pinnedLabs: ['chem:CREA'] }, 100)
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(account))
  await settle()
  expect(account).toMatchObject({ pinnedLabs: ['chem:ALT'] })
  expect(meta()?.dirty).toBe(false)
})

it('keeps the settings here, still unsaved, when the account refuses; clears on the next success', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({}, 100)))
  await settle()
  ;(runTransaction as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'))
  store.getState().update('a', { pinnedLabs: ['chem:K'] })
  await settle()
  expect(status()).toBe('error')
  expect(local()?.pinnedLabs).toEqual(['chem:K'])
  expect(meta()?.dirty).toBe(true)
  expect(JSON.parse(localStorage.getItem('mediprisma-outpatient-prefs')!).state.syncStatus).toBeUndefined()
  // Reconnect: the next account read retries the unsaved edit.
  emit(snapshot(remoteField({}, 100)))
  await settle()
  expect(account).toMatchObject({ pinnedLabs: ['chem:K'] })
  expect(status()).toBe('synced')
  expect(meta()?.dirty).toBe(false)
})

it('reports an account it cannot read without touching the settings', async () => {
  store.getState().update('a', { pinnedLabs: ['chem:K'] })
  stop = syncOutpatientPrefsForAccount('a')
  fail(new Error('unavailable'))
  expect(status()).toBe('error')
  expect(local()?.pinnedLabs).toEqual(['chem:K'])
})

it('keeps an edit made while a save is on its way and sends it next', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({}, 100)))
  await settle()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  transaction.get.mockImplementationOnce(async () => { await gate; return snapshot(account) })
  store.getState().update('a', { pinnedLabs: ['chem:K'] })
  await jest.advanceTimersByTimeAsync(700)
  store.getState().update('a', { pinnedLabs: ['chem:K', 'chem:ALT'] })
  release()
  await settle()
  await settle()
  expect(local()?.pinnedLabs).toEqual(['chem:K', 'chem:ALT'])
  expect(account).toMatchObject({ pinnedLabs: ['chem:K', 'chem:ALT'] })
  expect(meta()?.dirty).toBe(false)
})

it('refuses to write settings past the size limit and says so', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  emit(snapshot(remoteField({}, 100)))
  await settle()
  const big = Array.from({ length: 20 }, (_, i) => ({
    ...format(`f${i}`),
    tokens: Array.from({ length: 30 }, () => ({ kind: 'text' as const, text: 'x'.repeat(500) })),
  }))
  expect(JSON.stringify(big).length).toBeGreaterThan(MAX_SYNCED_CHARS)
  store.getState().update('a', { formats: big })
  await settle()
  expect(transaction.set).not.toHaveBeenCalled()
  expect(status()).toBe('error')
  expect(local()?.formats).toHaveLength(20)
})

it('stops reading and writing an account after sign-out or a switch', async () => {
  stop = syncOutpatientPrefsForAccount('a')
  const oldEmit = emit
  emit(snapshot(remoteField({}, 100)))
  await settle()
  store.getState().update('a', { pinnedLabs: ['chem:K'] })
  stop()
  stop = undefined
  expect(unsubscribe).toHaveBeenCalled()
  await settle()
  oldEmit(snapshot(remoteField({ pinnedLabs: ['chem:CREA'] }, 300)))
  await settle()
  expect(runTransaction).not.toHaveBeenCalled()
  expect(local()?.pinnedLabs).toEqual(['chem:K'])
  // Still unsaved: it goes up the next time this account signs in here.
  expect(meta()?.dirty).toBe(true)
})

describe('mergeOutpatientPrefs', () => {
  it('keeps the preferred side’s version of a format both sides have', () => {
    const merged = mergeOutpatientPrefs(
      prefs({ formats: [format('f1', 'mine')] }),
      prefs({ formats: [format('f1', 'theirs'), format('f2')] }),
    )
    expect(merged.formats.map((f) => [f.id, f.name])).toEqual([['f1', 'mine'], ['f2', 'f2']])
  })

  it('falls back to the other side for a choice the preferred side never made', () => {
    const merged = mergeOutpatientPrefs(prefs({ labMode: 'mine' }), prefs({ pinnedLabs: ['chem:K'], handoffMode: 'custom' }))
    expect(merged).toMatchObject({ labMode: 'mine', pinnedLabs: ['chem:K'], handoffMode: 'custom' })
  })
})
