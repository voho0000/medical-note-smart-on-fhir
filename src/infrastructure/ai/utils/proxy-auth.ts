// Firebase ID token for the owner-funded proxy Functions (audit A6).
//
// The proxies now require a signed-in user: x-proxy-key ships in the public
// bundle and proves nothing, so the Functions verify this token and meter
// quota per uid. Returns null when signed out — the proxy then responds 401
// and the UI surfaces a sign-in prompt.

// Type-only import — erased at compile time. A VALUE import from 'firebase/auth'
// here would execute the SDK at module load, which references the Fetch API
// `Response` global that jest's jsdom env lacks ("ReferenceError: Response is
// not defined"), breaking every test suite that transitively imports this file.
// We use the `auth.onAuthStateChanged` INSTANCE method below instead, so no
// runtime firebase/auth import is needed.
import type { Auth, User } from 'firebase/auth'

// Max time to wait for the (possibly anonymous) Firebase session to come up
// before giving up on a token. The auth provider mints an anonymous session
// ASYNCHRONOUSLY on first load (signInAnonymously fires a later auth-state
// change). On slow or storage-restricted browsers — iOS Safari/Chrome with ITP
// or private mode — that lag means the first AI request used to fire tokenless
// and 401: the "works on desktop, every proxy AI dead on iPhone" symptom.
// Waiting briefly lets the guest session settle so the call carries a token.
const AUTH_WAIT_MS = 5000

async function waitForFirebaseUser(auth: Auth): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser
  // Fast path: let the persisted auth state settle (resolves immediately once
  // the SDK has read storage). May resolve with no user on a first visit while
  // the anonymous sign-in is still in flight — handled below.
  try {
    if (typeof auth.authStateReady === 'function') await auth.authStateReady()
  } catch { /* best effort — fall through to the listener wait */ }
  if (auth.currentUser) return auth.currentUser
  // Still no user: the anonymous sign-in is likely mid-flight (it fires a later
  // onAuthStateChanged). Wait for it, bounded by AUTH_WAIT_MS.
  return new Promise<User | null>((resolve) => {
    let settled = false
    const finish = (u: User | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve(u)
    }
    const timer = setTimeout(() => finish(auth.currentUser), AUTH_WAIT_MS)
    // Instance method (not the standalone import) — keeps firebase/auth out of
    // the module's runtime import graph (see the type-only import note above).
    const unsubscribe = auth.onAuthStateChanged((u) => { if (u) finish(u) })
  })
}

export async function getProxyIdToken(): Promise<string | null> {
  try {
    // Dynamic import: firebase.config initializes the Firebase SDK at module
    // load, which blows up outside a real browser (jest/jsdom, SSR). Deferring
    // keeps this module safe to import anywhere; environments without Firebase
    // just resolve to null.
    const { auth } = await import('@/src/shared/config/firebase.config')
    if (!auth) return null
    const user = await waitForFirebaseUser(auth)
    return (await user?.getIdToken()) ?? null
  } catch {
    return null
  }
}

/** Convenience: header fragment to spread into proxy request headers. */
export async function getProxyAuthHeaders(): Promise<Record<string, string>> {
  const token = await getProxyIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
