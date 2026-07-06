// App Check token for the owner-funded proxy Functions (anti-abuse).
//
// Attests that the request comes from the genuine app (reCAPTCHA v3), so the
// proxy can reject raw scripts that mint throwaway anonymous sessions. Returns
// null when App Check isn't configured (local dev / emulator e2e) — the proxy
// runs log-only there and still works; enforcement is a separate server flag.

/** Resolve a short-lived App Check token, or null if App Check is unavailable. */
export async function getAppCheckToken(): Promise<string | null> {
  try {
    // Dynamic import keeps firebase/app-check out of the SSR/test import graph,
    // mirroring getProxyIdToken — the module is safe to import anywhere.
    const { appCheck } = await import('@/src/shared/config/firebase.config')
    if (!appCheck) return null
    const { getToken } = await import('firebase/app-check')
    const result = await getToken(appCheck, /* forceRefresh */ false)
    return result?.token ?? null
  } catch {
    return null
  }
}
