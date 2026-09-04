// Generic per-user Firestore collection sync factory.
// Owns the shared plumbing (collection pathing under users/{userId}/<collection>,
// snapshot subscription, batch writes, replace-all semantics, error handling)
// for modules like template-sync and clinical-insights-sync.
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import { isTemplateTextReference, readTemplateText, removeTemplateText, splitTemplateText, writeTemplateText } from './template-text-storage'

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
  /** Full prompt fields use immutable external bodies when a document is too large. */
  largeTextField?: string
}

export interface UserCollectionSync<T> {
  getAll: (userId: string) => Promise<T[]>
  save: (userId: string, item: T) => Promise<boolean>
  remove: (userId: string, itemId: string) => Promise<boolean>
  subscribe: (userId: string, onUpdate: (items: T[]) => void) => Unsubscribe
  batchSave: (userId: string, items: T[]) => Promise<boolean>
  applyChanges: (userId: string, upserts: T[], deleteIds: string[]) => Promise<boolean>
  replaceAll: (userId: string, items: T[]) => Promise<boolean>
}

const MAX_ATOMIC_WRITES = 500

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
    largeTextField,
  } = config

  async function decode(id: string, data: D): Promise<T> {
    if (largeTextField && data.textBody !== undefined) {
      if (!isTemplateTextReference(data.textBody)) throw new Error('Invalid template content reference')
      return fromDoc(id, { ...data, [largeTextField]: await readTemplateText(data.textBody) })
    }
    return fromDoc(id, data)
  }

  async function encode(userId: string, item: T, now: Timestamp): Promise<DocumentData> {
    const data = toDoc(item, now)
    if (largeTextField && typeof data[largeTextField] === 'string' && splitTemplateText(data[largeTextField]).length > 1) {
      const textBody = await writeTemplateText(data[largeTextField], userId, undefined, { collectionName, itemId: getId(item) })
      return { ...data, [largeTextField]: '', textBody }
    }
    return data
  }

  async function oldBodyIds(userId: string, ids: string[]): Promise<string[]> {
    if (!largeTextField || !db) return []
    const snapshots = await Promise.all(ids.map(id => getDoc(doc(db!, 'users', userId, collectionName, id))))
    return snapshots.flatMap(snapshot => {
      const body = snapshot.data()?.textBody
      return isTemplateTextReference(body) ? [body.id] : []
    })
  }

  async function cleanBodies(ids: string[]) {
    await Promise.all(ids.map(id => removeTemplateText(id).catch(() => {})))
  }

  async function getAll(userId: string): Promise<T[]> {
    if (!db) return []

    try {
      const itemsRef = collection(db, 'users', userId, collectionName)
      const q = query(itemsRef, orderBy('order', 'asc'))
      const snapshot = await getDocs(q)

      return await Promise.all(snapshot.docs.map(docSnap => decode(docSnap.id, docSnap.data() as D)))
    } catch (error) {
      console.error(`[${logLabel}] Error loading ${nounPlural}:`, error)
      return []
    }
  }

  async function save(userId: string, item: T): Promise<boolean> {
    if (!db) return false
    let data: DocumentData | undefined
    try {
      const itemRef = doc(db, 'users', userId, collectionName, getId(item))
      const now = Timestamp.now()

      const oldBodies = await oldBodyIds(userId, [getId(item)])
      data = await encode(userId, item, now)
      await setDoc(itemRef, data)
      await cleanBodies(oldBodies)

      return true
    } catch (error) {
      if (isTemplateTextReference(data?.textBody)) await cleanBodies([data.textBody.id])
      console.error(`[${logLabel}] Error saving ${nounSingular}:`, error)
      return false
    }
  }

  async function remove(userId: string, itemId: string): Promise<boolean> {
    if (!db) return false

    try {
      const itemRef = doc(db, 'users', userId, collectionName, itemId)
      const oldBodies = await oldBodyIds(userId, [itemId])
      await deleteDoc(itemRef)
      await cleanBodies(oldBodies)
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

    let generation = 0
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const current = ++generation
      Promise.all(snapshot.docs.map(docSnap => decode(docSnap.id, docSnap.data() as D))).then(items => {
        if (current !== generation) return
        if (subscribeOrdering.mode === 'memory') items.sort(subscribeOrdering.compare)
        onUpdate(items)
      }).catch(error => console.error(`[${logLabel}] Error loading template content:`, error))
    }, (error) => {
      console.error(`[${logLabel}] Error in subscription:`, error)
    })
    return () => { generation += 1; unsubscribe() }
  }

  async function batchSave(userId: string, items: T[]): Promise<boolean> {
    if (!db) return false

    try {
      const results = await Promise.all(items.map(item => save(userId, item)))
      return results.every(Boolean)
    } catch (error) {
      console.error(`[${logLabel}] Error batch saving ${nounPlural}:`, error)
      return false
    }
  }

  /**
   * Apply only the changed documents in one Firestore commit. A delete and an
   * upsert for the same id resolves to the upsert, matching the caller's final
   * local state.
   */
  async function applyChanges(userId: string, upserts: T[], deleteIds: string[]): Promise<boolean> {
    if (!db) return false
    const prepared: DocumentData[] = []
    try {
      const upsertsById = new Map(upserts.map((item) => [getId(item), item]))
      const deletes = [...new Set(deleteIds)].filter((id) => !upsertsById.has(id))
      const writeCount = upsertsById.size + deletes.length
      if (writeCount === 0) return true
      if (writeCount > MAX_ATOMIC_WRITES) {
        console.error(`[${logLabel}] Refusing non-atomic ${nounPlural} update with ${writeCount} writes`)
        return false
      }

      const itemsRef = collection(db, 'users', userId, collectionName)
      const batch = writeBatch(db)
      const now = Timestamp.now()
      const oldBodies = await oldBodyIds(userId, [...upsertsById.keys(), ...deletes])
      // Bodies are written privately before the one atomic parent commit.
      for (const [id, item] of upsertsById) {
        const data = await encode(userId, item, now)
        prepared.push(data)
        batch.set(doc(itemsRef, id), data)
      }
      deletes.forEach((id) => batch.delete(doc(itemsRef, id)))
      await batch.commit()
      await cleanBodies(oldBodies)
      return true
    } catch (error) {
      await cleanBodies(prepared.flatMap(data => isTemplateTextReference(data.textBody) ? [data.textBody.id] : []))
      console.error(`[${logLabel}] Error applying ${nounPlural} changes:`, error)
      return false
    }
  }

  async function replaceAll(userId: string, items: T[]): Promise<boolean> {
    if (!db) return false

    try {
      // Do not call getAll() here: that public helper intentionally converts a
      // read failure to an empty list, which would make stale remote documents
      // look as if they did not exist. Keep the read and write in this failure
      // boundary, then commit the complete replacement atomically.
      const itemsRef = collection(db, 'users', userId, collectionName)
      // Use an unordered collection query so legacy documents missing `order`
      // are still visible and can be deleted.
      const snapshot = await getDocs(query(itemsRef))
      const nextById = new Map(items.map((item) => [getId(item), item]))
      const deleteIds = snapshot.docs
        .map((docSnap) => docSnap.id)
        .filter((id) => !nextById.has(id))
      return applyChanges(userId, [...nextById.values()], deleteIds)
    } catch (error) {
      console.error(`[${logLabel}] Error replacing ${nounPlural}:`, error)
      return false
    }
  }

  return { getAll, save, remove, subscribe, batchSave, applyChanges, replaceAll }
}
