'use client'

/** Use the existing real account without a second login or a Collector request. */
export async function captureFhirFirebaseAuth(): Promise<{ getToken: () => Promise<string | null> } | null> {
  try {
    const { auth } = await import('@/src/shared/config/firebase.config')
    if (!auth) return null
    await auth.authStateReady()
    const user = auth.currentUser
    if (!user || user.isAnonymous) return null
    return { getToken: async () => {
      try {
        if (auth.currentUser !== user) return null
        const token = await user.getIdToken()
        return auth.currentUser === user && !user.isAnonymous && token ? token : null
      } catch { return null }
    } }
  } catch { return null }
}
