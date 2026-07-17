/**
 * Prompt Gallery Service
 * Handles Firestore operations for shared prompts
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import {
  normalizePromptTypes,
  type SharedPrompt,
  type PromptGalleryFilter,
  type PromptGallerySort,
} from '../types/prompt.types'

const COLLECTION_NAME = 'sharedPrompts'

/**
 * Convert Firestore document to SharedPrompt
 */
function convertToSharedPrompt(id: string, data: any): SharedPrompt {
  // Treat missing/empty audience as 'medical' for backward compatibility with prompts shared before audience field existed.
  const audience = Array.isArray(data.audience) && data.audience.length > 0
    ? data.audience
    : ['medical']
  return {
    id,
    title: data.title,
    description: data.description,
    prompt: data.prompt,
    types: normalizePromptTypes(id, data.types),
    category: data.category,
    specialty: data.specialty || [],
    audience,
    tags: data.tags || [],
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    authorId: data.authorId,
    authorName: data.authorName,
    isAnonymous: data.isAnonymous === true,
    usageCount: data.usageCount || 0,
  }
}

/**
 * Get all shared prompts with optional filtering and sorting
 */
export async function getSharedPrompts(
  filter?: PromptGalleryFilter,
  sort?: PromptGallerySort
): Promise<SharedPrompt[]> {
  if (!db) return []
  try {
    const constraints: QueryConstraint[] = []

    // `summary` replaced the stored `insight` value. Fetch that type broadly
    // and normalize/filter below so both legacy Insight records and the
    // upgraded built-in templates are discoverable without a database flag day.
    const filterSummaryClientSide = filter?.type === 'summary'

    // Apply filters. Firestore allows only one array-contains per query.
    // Priority: server-side type > specialty.
    if (filter?.type && !filterSummaryClientSide) {
      constraints.push(where('types', 'array-contains', filter.type))
    }
    if (filter?.category) {
      constraints.push(where('category', '==', filter.category))
    }
    // Summary type filtering happens client-side, so specialty can still use
    // the one available array-contains slot in that case.
    if (filter?.specialty && (!filter?.type || filterSummaryClientSide)) {
      constraints.push(where('specialty', 'array-contains', filter.specialty))
    }

    // Apply sorting
    if (sort) {
      constraints.push(orderBy(sort.field, sort.direction))
    } else {
      constraints.push(orderBy('createdAt', 'desc'))
    }

    // Limit results
    constraints.push(limit(100))

    const q = query(collection(db, COLLECTION_NAME), ...constraints)
    const querySnapshot = await getDocs(q)

    let prompts = querySnapshot.docs.map((doc) =>
      convertToSharedPrompt(doc.id, doc.data())
    )

    if (filterSummaryClientSide) {
      prompts = prompts.filter((prompt) => prompt.types.includes('summary'))
    }

    // Client-side filtering for search query, tags, and specialty (when type
    // filtering already consumed Firestore's array-contains slot).
    if (filter?.searchQuery) {
      const searchLower = filter.searchQuery.toLowerCase()
      prompts = prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.prompt.toLowerCase().includes(searchLower) ||
          p.authorName?.toLowerCase().includes(searchLower) ||
          p.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      )
    }

    if (filter?.tags && filter.tags.length > 0) {
      prompts = prompts.filter((p) =>
        filter.tags!.some((tag) => p.tags.includes(tag))
      )
    }

    // Filter by specialty on client-side if types filter is also present
    // (to avoid Firestore's limitation of one array-contains per query)
    if (filter?.specialty && filter?.type && !filterSummaryClientSide) {
      prompts = prompts.filter((p) => p.specialty.includes(filter.specialty!))
    }

    // Filter by audience on client-side (Firestore allows only one array-contains per query)
    if (filter?.audience) {
      prompts = prompts.filter((p) => p.audience.includes(filter.audience!))
    }

    return prompts
  } catch (error) {
    console.error('Error fetching shared prompts:', error)
    throw error
  }
}

/**
 * Get a single shared prompt by ID
 */
export async function getSharedPrompt(id: string): Promise<SharedPrompt | null> {
  if (!db) return null
  try {
    const docRef = doc(db, COLLECTION_NAME, id)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return convertToSharedPrompt(docSnap.id, docSnap.data())
    }
    return null
  } catch (error) {
    console.error('Error fetching shared prompt:', error)
    throw error
  }
}

/**
 * Create a new shared prompt
 */
export async function createSharedPrompt(
  prompt: Omit<SharedPrompt, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  if (!db) {
    throw new Error('Firestore database is not initialized. Make sure you are on the client side.')
  }

  try {
    const now = Timestamp.now()
    
    // Build data object, filtering out undefined values
    const data: any = {
      title: prompt.title,
      prompt: prompt.prompt,
      types: prompt.types,
      category: prompt.category,
      specialty: prompt.specialty,
      audience: prompt.audience && prompt.audience.length > 0 ? prompt.audience : ['medical'],
      tags: prompt.tags,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    }
    
    // Add optional fields only if they have values
    if (prompt.description !== undefined) {
      data.description = prompt.description
    }
    if (prompt.authorId !== undefined) {
      data.authorId = prompt.authorId
    }
    if (prompt.authorName !== undefined) {
      data.authorName = prompt.authorName
    }
    if (prompt.isAnonymous !== undefined) {
      data.isAnonymous = prompt.isAnonymous
    }
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), data)
    return docRef.id
  } catch (error) {
    console.error('Error creating shared prompt:', error)
    throw error
  }
}

/**
 * Delete a shared prompt
 */
export async function deleteSharedPrompt(id: string): Promise<void> {
  if (!db) throw new Error('Firestore database is not initialized')
  try {
    const docRef = doc(db, COLLECTION_NAME, id)
    await deleteDoc(docRef)
  } catch (error) {
    console.error('Error deleting shared prompt:', error)
    throw error
  }
}

/**
 * Update an existing shared prompt
 */
export async function updateSharedPrompt(
  id: string,
  updates: Partial<Omit<SharedPrompt, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  if (!db) throw new Error('Firestore database is not initialized')
  try {
    const docRef = doc(db, COLLECTION_NAME, id)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now(),
    })
  } catch (error) {
    console.error('Error updating shared prompt:', error)
    throw error
  }
}

/**
 * Increment usage count for a prompt
 */
export async function incrementPromptUsage(id: string): Promise<void> {
  if (!db) return
  try {
    const docRef = doc(db, COLLECTION_NAME, id)
    await updateDoc(docRef, {
      usageCount: increment(1),
    })
  } catch (error) {
    console.error('Error incrementing prompt usage:', error)
    // Don't throw - this is not critical
  }
}

/**
 * Get prompts created by a specific user
 */
export async function getMySharedPrompts(
  userId: string,
  filter?: Omit<PromptGalleryFilter, 'authorId'>,
  sort?: PromptGallerySort
): Promise<SharedPrompt[]> {
  if (!db) return []
  try {
    const constraints: QueryConstraint[] = []

    // Filter by author
    constraints.push(where('authorId', '==', userId))

    const filterSummaryClientSide = filter?.type === 'summary'

    // Apply additional filters. See getSharedPrompts for the legacy
    // insight-to-summary compatibility rationale.
    if (filter?.type && !filterSummaryClientSide) {
      constraints.push(where('types', 'array-contains', filter.type))
    }
    if (filter?.category) {
      constraints.push(where('category', '==', filter.category))
    }
    if (filter?.specialty && (!filter?.type || filterSummaryClientSide)) {
      constraints.push(where('specialty', 'array-contains', filter.specialty))
    }

    // Apply sorting
    if (sort) {
      constraints.push(orderBy(sort.field, sort.direction))
    } else {
      constraints.push(orderBy('createdAt', 'desc'))
    }

    // Limit results
    constraints.push(limit(100))

    const q = query(collection(db, COLLECTION_NAME), ...constraints)
    const querySnapshot = await getDocs(q)

    let prompts = querySnapshot.docs.map((doc) =>
      convertToSharedPrompt(doc.id, doc.data())
    )

    if (filterSummaryClientSide) {
      prompts = prompts.filter((prompt) => prompt.types.includes('summary'))
    }

    // Client-side filtering for search query, tags, and specialty (when the
    // type filter already consumed Firestore's array-contains slot).
    if (filter?.searchQuery) {
      const searchLower = filter.searchQuery.toLowerCase()
      prompts = prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.prompt.toLowerCase().includes(searchLower) ||
          p.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      )
    }

    if (filter?.tags && filter.tags.length > 0) {
      prompts = prompts.filter((p) =>
        filter.tags!.some((tag) => p.tags.includes(tag))
      )
    }

    // Filter by specialty on client-side if types filter is also present
    if (filter?.specialty && filter?.type && !filterSummaryClientSide) {
      prompts = prompts.filter((p) => p.specialty.includes(filter.specialty!))
    }

    // Filter by audience on client-side
    if (filter?.audience) {
      prompts = prompts.filter((p) => p.audience.includes(filter.audience!))
    }

    return prompts
  } catch (error) {
    console.error('Error fetching my shared prompts:', error)
    throw error
  }
}
