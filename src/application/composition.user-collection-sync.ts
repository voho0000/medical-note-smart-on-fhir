// Per-user Firestore subcollection sync (users/{uid}/<collection>), exposed so
// feature services can persist account-bound records without importing the
// Firebase implementation directly.
export { createUserCollectionSync } from '@/src/infrastructure/firebase/user-collection-sync'
export type { UserCollectionSync, UserCollectionSyncConfig } from '@/src/infrastructure/firebase/user-collection-sync'
