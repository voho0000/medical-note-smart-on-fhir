// Firebase ID token for the owner-funded proxy Functions (audit A6).
//
// The proxies now require a signed-in user: x-proxy-key ships in the public
// bundle and proves nothing, so the Functions verify this token and meter
// quota per uid. Returns null when signed out — the proxy then responds 401
// and the UI surfaces a sign-in prompt.

export async function getProxyIdToken(): Promise<string | null> {
  try {
    // Dynamic import: firebase.config initializes the Firebase SDK at module
    // load, which blows up outside a real browser (jest/jsdom, SSR). Deferring
    // keeps this module safe to import anywhere; environments without Firebase
    // just resolve to null.
    const { auth } = await import('@/src/shared/config/firebase.config')
    return (await auth?.currentUser?.getIdToken()) ?? null
  } catch {
    return null
  }
}

/** Convenience: header fragment to spread into proxy request headers. */
export async function getProxyAuthHeaders(): Promise<Record<string, string>> {
  const token = await getProxyIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
