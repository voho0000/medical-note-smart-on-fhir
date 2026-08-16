import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import type {
  AdminFeatureRequestUpdate,
  CreateFeatureRequestInput,
  EditFeatureRequestInput,
  FeatureRequest,
  FeatureRequestCategory,
  FeatureRequestHiddenBy,
  FeatureRequestOwnership,
  FeatureRequestStatus,
  FeatureRequestVisibility,
} from './types'
import { FEATURE_REQUEST_CATEGORIES, FEATURE_REQUEST_STATUSES } from './types'

const REQUESTS_COLLECTION = 'featureRequests'
const OWNERS_COLLECTION = 'featureRequestOwners'
const VOTES_COLLECTION = 'featureRequestVotes'
const MAX_PUBLIC_REQUESTS = 200

function requireDb(): Firestore {
  if (!db) throw new Error('Firestore database is not available')
  return db
}
function toDate(value: unknown): Date {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const converted = (value as { toDate: () => unknown }).toDate()
    if (converted instanceof Date) return converted
  }
  if (value instanceof Date) return value
  return new Date(0)
}

function isCategory(value: unknown): value is FeatureRequestCategory {
  return typeof value === 'string' && FEATURE_REQUEST_CATEGORIES.includes(value as FeatureRequestCategory)
}

function isStatus(value: unknown): value is FeatureRequestStatus {
  return typeof value === 'string' && FEATURE_REQUEST_STATUSES.includes(value as FeatureRequestStatus)
}

function isVisibility(value: unknown): value is FeatureRequestVisibility {
  return value === 'visible' || value === 'hidden'
}

function isHiddenBy(value: unknown): value is FeatureRequestHiddenBy {
  return value === '' || value === 'author' || value === 'admin'
}

function fromRequestDoc(snapshot: QueryDocumentSnapshot<DocumentData>): FeatureRequest {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    category: isCategory(data.category) ? data.category : 'feature',
    status: isStatus(data.status) ? data.status : 'evaluating',
    displayAuthor: data.displayAuthor === true,
    authorName: typeof data.authorName === 'string' ? data.authorName : '',
    officialNote: typeof data.officialNote === 'string' ? data.officialNote : '',
    visibility: isVisibility(data.visibility) ? data.visibility : 'visible',
    hiddenReason: typeof data.hiddenReason === 'string' ? data.hiddenReason : '',
    hiddenBy: isHiddenBy(data.hiddenBy) ? data.hiddenBy : '',
    voteCount: Number.isInteger(data.voteCount) && data.voteCount >= 0 ? data.voteCount : 0,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  }
}

function fromOwnerDoc(snapshot: QueryDocumentSnapshot<DocumentData>): FeatureRequestOwnership {
  const data = snapshot.data()
  return {
    requestId: snapshot.id,
    authorId: typeof data.authorId === 'string' ? data.authorId : '',
    authorEmail: typeof data.authorEmail === 'string' ? data.authorEmail : '',
    createdAt: toDate(data.createdAt),
  }
}

export function subscribeFeatureRequests(
  includeHidden: boolean,
  onData: (requests: FeatureRequest[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const firestore = requireDb()
  const source = includeHidden
    ? query(collection(firestore, REQUESTS_COLLECTION), limit(MAX_PUBLIC_REQUESTS))
    : query(
        collection(firestore, REQUESTS_COLLECTION),
        where('visibility', '==', 'visible'),
        limit(MAX_PUBLIC_REQUESTS),
      )

  return onSnapshot(
    source,
    (snapshot) => onData(snapshot.docs.map(fromRequestDoc)),
    (error) => onError(error),
  )
}

export function subscribeFeatureRequestOwnerships(
  userId: string,
  includeAll: boolean,
  onData: (ownerships: FeatureRequestOwnership[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const firestore = requireDb()
  const source = includeAll
    ? query(collection(firestore, OWNERS_COLLECTION), limit(MAX_PUBLIC_REQUESTS))
    : query(
        collection(firestore, OWNERS_COLLECTION),
        where('authorId', '==', userId),
        limit(MAX_PUBLIC_REQUESTS),
      )

  return onSnapshot(
    source,
    (snapshot) => onData(snapshot.docs.map(fromOwnerDoc)),
    (error) => onError(error),
  )
}

export function subscribeFeatureRequestVotes(
  userId: string,
  onData: (requestIds: Set<string>) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const firestore = requireDb()
  const source = query(
    collection(firestore, VOTES_COLLECTION, userId, 'requests'),
    limit(MAX_PUBLIC_REQUESTS),
  )

  return onSnapshot(
    source,
    (snapshot) => onData(new Set(snapshot.docs.map((vote) => vote.id))),
    (error) => onError(error),
  )
}

export async function createFeatureRequest(input: CreateFeatureRequestInput): Promise<string> {
  const firestore = requireDb()
  const requestRef = doc(collection(firestore, REQUESTS_COLLECTION))
  const ownerRef = doc(firestore, OWNERS_COLLECTION, requestRef.id)
  const batch = writeBatch(firestore)

  batch.set(requestRef, {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    status: 'evaluating',
    displayAuthor: input.displayAuthor,
    authorName: input.displayAuthor ? input.authorName.trim() : '',
    officialNote: '',
    visibility: 'visible',
    hiddenReason: '',
    hiddenBy: '',
    voteCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  batch.set(ownerRef, {
    authorId: input.authorId,
    authorEmail: input.authorEmail,
    createdAt: serverTimestamp(),
  })

  await batch.commit()
  return requestRef.id
}

export async function editFeatureRequest(
  requestId: string,
  input: EditFeatureRequestInput,
): Promise<void> {
  const firestore = requireDb()
  await updateDoc(doc(firestore, REQUESTS_COLLECTION, requestId), {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    displayAuthor: input.displayAuthor,
    authorName: input.displayAuthor ? input.authorName.trim() : '',
    updatedAt: serverTimestamp(),
  })
}

export async function withdrawFeatureRequest(requestId: string): Promise<void> {
  const firestore = requireDb()
  await updateDoc(doc(firestore, REQUESTS_COLLECTION, requestId), {
    visibility: 'hidden',
    hiddenReason: 'withdrawn',
    hiddenBy: 'author',
    updatedAt: serverTimestamp(),
  })
}

export async function updateFeatureRequestAsAdmin(
  requestId: string,
  update: AdminFeatureRequestUpdate,
): Promise<void> {
  const firestore = requireDb()
  await updateDoc(doc(firestore, REQUESTS_COLLECTION, requestId), {
    status: update.status,
    officialNote: update.officialNote.trim(),
    visibility: update.visibility,
    hiddenReason: update.visibility === 'hidden' ? 'moderated' : '',
    hiddenBy: update.visibility === 'hidden' ? 'admin' : '',
    updatedAt: serverTimestamp(),
  })
}

export async function toggleFeatureRequestVote(
  requestId: string,
  userId: string,
): Promise<boolean> {
  const firestore = requireDb()
  const requestRef = doc(firestore, REQUESTS_COLLECTION, requestId)
  const voteRef = doc(firestore, VOTES_COLLECTION, userId, 'requests', requestId)

  return runTransaction(firestore, async (transaction) => {
    const [requestSnapshot, voteSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(voteRef),
    ])
    if (!requestSnapshot.exists()) throw new Error('Feature request not found')

    const voteCount = requestSnapshot.data().voteCount
    const currentCount = Number.isInteger(voteCount) && voteCount >= 0 ? voteCount : 0
    if (voteSnapshot.exists()) {
      transaction.delete(voteRef)
      transaction.update(requestRef, { voteCount: Math.max(0, currentCount - 1) })
      return false
    }

    transaction.set(voteRef, {
      requestId,
      userId,
      createdAt: serverTimestamp(),
    })
    transaction.update(requestRef, { voteCount: currentCount + 1 })
    return true
  })
}

export async function hasFeatureRequestVote(requestId: string, userId: string): Promise<boolean> {
  const firestore = requireDb()
  return (await getDoc(doc(firestore, VOTES_COLLECTION, userId, 'requests', requestId))).exists()
}
