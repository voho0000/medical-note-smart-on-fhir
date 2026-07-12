// Generic per-user Firestore collection sync factory.
// Owns the shared plumbing (collection pathing under users/{userId}/<collection>,
// snapshot subscription, batch writes, replace-all semantics, error handling)
// for modules like template-sync and clinical-insights-sync.
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'

/**
 * How the real-time subscription orders results.
 * - `query`: use Firestore `orderBy('order', 'asc')` in the snapshot query.
 * - `memory`: plain (unordered) query, then sort in memory with `compare`
 *   (avoids Firestore index issues).
 */
export type SubscribeOrdering<T> =
  | { mode: 'query' }
  | { mode: 'memory'; compare: (a: T, b: T) => number }

export interface UserCollectionSyncConfig<T, D extends DocumentData> {
  /** Firestore subcollection name under users/{userId}/... */
  collectionName: string
  /** Console log prefix, e.g. 'Template Sync' -> '[Template Sync] ...' */
  logLabel: string
  /** Noun used in log messages, e.g. 'template' / 'templates'. */
  nounSingular: string
  nounPlural: string
  /** Map a Firestore document (doc.id + doc.data()) to the app-level item. */
  fromDoc: (id: string, data: D) => T
  /** Map an app-level item to the exact Firestore document payload. */
  toDoc: (item: T, now: Timestamp) => DocumentData
  /** Extract the document id from an app-level item. */
  getId: (item: T) => string
  subscribeOrdering: SubscribeOrdering<T>
}

export interface UserCollectionSync<T> {
  getAll: (userId: string) => Promise<T[]>
  save: (userId: string, item: T) => Promise<boolean>
  remove: (userId: string, itemId: string) => Promise<boolean>
  subscribe: (userId: string, onUpdate: (items: T[]) => void) => Unsubscribe
  batchSave: (userId: string, items: T[]) => Promise<boolean>
  replaceAll: (userId: string, items: T[]) => Promise<boolean>
}

export function createUserCollectionSync<T, D extends DocumentData>(
  config: UserCollectionSyncConfig<T, D>
): UserCollectionSync<T> {
  const {
    collectionName,
    logLabel,
    nounSingular,
    nounPlural,
    fromDoc,
    toDoc,
    getId,
    subscribeOrdering,
  } = config

  async function getAll(userId: string): Promise<T[]> {
    if (!db) return []

    try {
      const itemsRef = collection(db, 'users', userId, collectionName)
      const q = query(itemsRef, orderBy('order', 'asc'))
      const snapshot = await getDocs(q)

      return snapshot.docs.map(docSnap => fromDoc(docSnap.id, docSnap.data() as D))
    } catch (error) {
      console.error(`[${logLabel}] Error loading ${nounPlural}:`, error)
      return []
    }
  }

  async function save(userId: string, item: T): Promise<boolean> {
    if (!db) return false

    try {
      const itemRef = doc(db, 'users', userId, collectionName, getId(item))
      const now = Timestamp.now()

      await setDoc(itemRef, toDoc(item, now))

      return true
    } catch (error) {
      console.error(`[${logLabel}] Error saving ${nounSingular}:`, error)
      return false
    }
  }

  async function remove(userId: string, itemId: string): Promise<boolean> {
    if (!db) return false

    try {
      const itemRef = doc(db, 'users', userId, collectionName, itemId)
      await deleteDoc(itemRef)
      return true
    } catch (error) {
      console.error(`[${logLabel}] Error deleting ${nounSingular}:`, error)
      return false
    }
  }

  function subscribe(userId: string, onUpdate: (items: T[]) => void): Unsubscribe {
    if (!db) return () => {}

    const itemsRef = collection(db, 'users', userId, collectionName)
    const q =
      subscribeOrdering.mode === 'query'
        ? query(itemsRef, orderBy('order', 'asc'))
        : // Don't use orderBy in Firestore - sort in memory to avoid index issues
          query(itemsRef)

    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(docSnap => fromDoc(docSnap.id, docSnap.data() as D))
      if (subscribeOrdering.mode === 'memory') {
        items.sort(subscribeOrdering.compare)
      }
      onUpdate(items)
    }, (error) => {
      console.error(`[${logLabel}] Error in subscription:`, error)
    })
  }

  async function batchSave(userId: string, items: T[]): Promise<boolean> {
    if (!db) return false

    try {
      const promises = items.map(item => save(userId, item))
      await Promise.all(promises)
      return true
    } catch (error) {
      console.error(`[${logLabel}] Error batch saving ${nounPlural}:`, error)
      return false
    }
  }

  async function replaceAll(userId: string, items: T[]): Promise<boolean> {
    if (!db) return false

    try {
      // First, get all existing items
      const existingItems = await getAll(userId)

      // Delete all existing items
      const deletePromises = existingItems.map(item => remove(userId, getId(item)))
      await Promise.all(deletePromises)

      // Then save new items
      const savePromises = items.map(item => save(userId, item))
      await Promise.all(savePromises)

      return true
    } catch (error) {
      console.error(`[${logLabel}] Error replacing ${nounPlural}:`, error)
      return false
    }
  }

  return { getAll, save, remove, subscribe, batchSave, replaceAll }
}
