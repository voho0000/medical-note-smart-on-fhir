import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockFirebaseSignOut = jest.fn()
const mockOnAuthStateChanged = jest.fn()
const mockClearAllKeys = jest.fn()
const mockClearSmartSession = jest.fn()
const mockClearLocalBundle = jest.fn()
const mockPurgeAiResultCaches = jest.fn()
const mockNotifyBundleChanged = jest.fn()

jest.mock('firebase/auth', () => ({
  signInWithPopup: jest.fn(),
  getRedirectResult: jest.fn().mockResolvedValue(null),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInAnonymously: jest.fn(),
  signOut: (...args: unknown[]) => mockFirebaseSignOut(...args),
  sendPasswordResetEmail: jest.fn(),
  sendEmailVerification: jest.fn(),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  setPersistence: jest.fn(),
  browserLocalPersistence: {},
  GoogleAuthProvider: class GoogleAuthProvider {
    setCustomParameters() {}
  },
}))

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(),
}))

jest.mock('@/src/shared/config/firebase.config', () => ({
  auth: { currentUser: { uid: 'account-1' } },
  db: null,
}))

jest.mock('@/src/application/stores/ai-config.store', () => ({
  useAiConfigStore: {
    getState: () => ({ clearAllKeys: mockClearAllKeys }),
  },
}))

jest.mock('@/src/infrastructure/fhir/client/fhir-client.service', () => ({
  clearSmartSession: mockClearSmartSession,
}))

jest.mock('@/src/infrastructure/fhir/services/local-bundle.service', () => ({
  LocalBundleService: {
    getActiveImportId: jest.fn(() => 'import-1'),
    clear: mockClearLocalBundle,
  },
}))

jest.mock('@/src/infrastructure/cache/encrypted-session-cache', () => ({
  purgeAiResultCaches: mockPurgeAiResultCaches,
}))

jest.mock('@/src/shared/utils/reset-on-bundle-change', () => ({
  notifyBundleChanged: mockNotifyBundleChanged,
}))

import {
  AuthProvider,
  useAuth,
} from '@/src/application/providers/auth.provider'

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('AuthProvider account sign-out', () => {
  beforeEach(() => {
    mockFirebaseSignOut.mockResolvedValue(undefined)
    mockOnAuthStateChanged.mockImplementation((
      _auth: unknown,
      onChange: (user: Record<string, unknown>) => void,
    ) => {
      onChange({
        uid: 'account-1',
        email: 'clinician@example.test',
        displayName: 'Clinician',
        photoURL: null,
        emailVerified: true,
        isAnonymous: false,
      })
      return jest.fn()
    })
  })

  it('keeps the active clinical session while clearing account credentials', async () => {
    sessionStorage.setItem('SMART_KEY', 'smart-state-key')
    sessionStorage.setItem('smart-state-key', JSON.stringify({
      tokenResponse: { access_token: 'test-token' },
    }))
    sessionStorage.setItem('__bundle_session_key__', 'bundle-key')
    sessionStorage.setItem('mediprisma:demo-active', 'demo-import')
    localStorage.setItem('__crypto_session_key__', 'credential-key')

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signOut()
    })

    expect(mockFirebaseSignOut).toHaveBeenCalledTimes(1)
    expect(mockClearAllKeys).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('__crypto_session_key__')).toBeNull()

    expect(mockClearSmartSession).not.toHaveBeenCalled()
    expect(mockClearLocalBundle).not.toHaveBeenCalled()
    expect(mockPurgeAiResultCaches).not.toHaveBeenCalled()
    expect(mockNotifyBundleChanged).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('SMART_KEY')).toBe('smart-state-key')
    expect(sessionStorage.getItem('__bundle_session_key__')).toBe('bundle-key')
    expect(sessionStorage.getItem('mediprisma:demo-active')).toBe('demo-import')
  })
})
