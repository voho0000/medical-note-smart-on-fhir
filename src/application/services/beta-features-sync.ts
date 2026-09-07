import { doc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import { useBetaFeaturesStore } from '@/src/application/stores/beta-features.store'

/** One subscription per signed-in session, owned by AuthProvider. */
export function syncBetaFeaturesForAccount(userId: string): () => void {
  const database = db
  if (!database) return () => {}
  const userRef = doc(database, 'users', userId)
  let active = true
  let applyingRemote = false
  let pending = 0
  let revision = 0
  let migrationAttempted = false
  let writeFailed = false
  let remoteValue: boolean | undefined

  const applyRemote = () => {
    if (!active || pending || writeFailed || remoteValue === undefined) return
    applyingRemote = true
    useBetaFeaturesStore.getState().setBetaFeaturesEnabled(userId, remoteValue)
    applyingRemote = false
  }
  const trackWrite = async (write: () => Promise<unknown>) => {
    pending += 1
    // Only a snapshot received after this write can supersede the local choice.
    remoteValue = undefined
    try {
      await write()
      writeFailed = false
      if (active) useBetaFeaturesStore.getState().setSyncError(userId, false)
    } catch {
      // Firestore rolls rejected optimistic writes back in its snapshots.
      // Keep the user's browser choice, with an explicit sync error, instead.
      writeFailed = true
      if (active) useBetaFeaturesStore.getState().setSyncError(userId, true)
    } finally {
      pending -= 1
      applyRemote()
    }
  }

  const unsubscribeStore = useBetaFeaturesStore.subscribe((state, previous) => {
    const enabled = state.enabledByUser[userId]
    if (applyingRemote || enabled === undefined || enabled === previous.enabledByUser[userId]) return
    revision += 1
    void trackWrite(() => setDoc(userRef, {
      preferences: { betaFeaturesEnabled: enabled },
    }, { merge: true }))
  })

  const unsubscribeRemote = onSnapshot(userRef, { includeMetadataChanges: true }, (snapshot) => {
    if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
    if (!writeFailed) useBetaFeaturesStore.getState().setSyncError(userId, false)
    const value = snapshot.data()?.preferences?.betaFeaturesEnabled
    if (typeof value === 'boolean') {
      remoteValue = value
      applyRemote()
      return
    }

    // Migrate only this account's old browser preference, never the guest's.
    // A transaction preserves a preference another device has already saved.
    const localValue = useBetaFeaturesStore.getState().enabledByUser[userId]
    if (migrationAttempted || pending || localValue === undefined) return
    migrationAttempted = true
    const initialRevision = revision
    void trackWrite(() => runTransaction(database, async (transaction) => {
      const current = await transaction.get(userRef)
      if (!active || revision !== initialRevision) return
      if (typeof current.data()?.preferences?.betaFeaturesEnabled !== 'boolean') {
        transaction.set(userRef, {
          preferences: { betaFeaturesEnabled: localValue },
        }, { merge: true })
      }
    }))
  }, () => {
    if (active) useBetaFeaturesStore.getState().setSyncError(userId, true)
  })

  return () => {
    active = false
    unsubscribeStore()
    unsubscribeRemote()
  }
}
