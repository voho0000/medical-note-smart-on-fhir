import { captureCollectorAuth } from '@/src/infrastructure/telemetry/collector-auth'

const mockAuth = { authStateReady: jest.fn(async () => {}), currentUser: null as null | { getIdToken: jest.Mock } }
jest.mock('@/src/shared/config/firebase.config', () => ({ auth: mockAuth }))

beforeEach(() => { mockAuth.authStateReady.mockReset().mockResolvedValue(undefined); mockAuth.currentUser = null })

test('no existing session means no prompt or account creation', async () => {
  expect(await captureCollectorAuth()).toBeNull()
})
test('uses the SDK for current tokens without storing them', async () => {
  const user = { getIdToken: jest.fn().mockResolvedValue('synthetic-current-token') }
  mockAuth.currentUser = user
  const credential = await captureCollectorAuth()
  expect(user.getIdToken).not.toHaveBeenCalled()
  expect(await credential?.getToken()).toBe('synthetic-current-token')
})
test('a user switch or signout invalidates the captured identity', async () => {
  const user = { getIdToken: jest.fn().mockResolvedValue('synthetic-old-token') }
  mockAuth.currentUser = user
  const credential = await captureCollectorAuth()
  mockAuth.currentUser = { getIdToken: jest.fn().mockResolvedValue('synthetic-other-token') }
  expect(await credential?.getToken()).toBeNull()
  expect(user.getIdToken).not.toHaveBeenCalled()
})
test('a user switch during SDK refresh also prevents transmission', async () => {
  const user = { getIdToken: jest.fn(async () => { mockAuth.currentUser = null; return 'synthetic-old-token' }) }
  mockAuth.currentUser = user
  const credential = await captureCollectorAuth()
  expect(await credential?.getToken()).toBeNull()
})
test('Firebase initialization and token errors stay in the telemetry sidecar', async () => {
  mockAuth.authStateReady.mockRejectedValueOnce(new Error('synthetic unavailable'))
  expect(await captureCollectorAuth()).toBeNull()
  mockAuth.currentUser = { getIdToken: jest.fn().mockRejectedValue(new Error('synthetic unavailable')) }
  expect(await (await captureCollectorAuth())?.getToken()).toBeNull()
})
