'use client'

/** Capture an existing Firebase user; never trigger a login prompt or create an account. */
export async function captureCollectorAuth(): Promise<{ getToken: () => Promise<string | null> } | null> {
  try {
    const { auth } = await import('@/src/shared/config/firebase.config')
    if (!auth) return null
    await auth.authStateReady()
    const user = auth.currentUser
    if (!user) return null
    return { getToken: async () => {
      try {
        if (auth.currentUser !== user) return null
        const token = await user.getIdToken()
        return auth.currentUser === user ? token : null
      } catch { return null }
    } }
  } catch { return null }
}
