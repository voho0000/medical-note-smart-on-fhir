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
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import type { SharedPrompt, PromptGalleryFilter, PromptGallerySort } from '../types/prompt.types'

const COLLECTION_NAME = 'sharedPrompts'

/**
 * Convert Firestore document to SharedPrompt
 */
function convertToSharedPrompt(id: string, data: any): SharedPrompt {
  return {
    id,
    title: data.title,
    description: data.description,
    prompt: data.prompt,
    types: data.types || [],
    category: data.category,
    specialty: data.specialty || [],
    tags: data.tags || [],
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    authorId: data.authorId,
    authorName: data.authorName,
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
  try {
    const constraints: QueryConstraint[] = []

    // Apply filters
    // Note: Firestore allows only one array-contains per query
    // Priority: types > specialty (specialty will be filtered client-side if both exist)
    if (filter?.type) {
      constraints.push(where('types', 'array-contains', filter.type))
    }
    if (filter?.category) {
      constraints.push(where('category', '==', filter.category))
    }
    // Only add specialty to Firestore query if types is not present
    if (filter?.specialty && !filter?.type) {
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

    // Client-side filtering for search query, tags, and specialty (when types is also present)
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
    if (filter?.specialty && filter?.type) {
      prompts = prompts.filter((p) => p.specialty.includes(filter.specialty!))
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
  console.log('createSharedPrompt 開始')
  
  if (!db) {
    const error = new Error('Firestore database is not initialized. Make sure you are on the client side.')
    console.error('❌ Firestore 未初始化:', error)
    throw error
  }

  try {
    console.log('準備寫入 Firestore，collection:', COLLECTION_NAME)
    console.log('資料:', prompt)
    
    const now = Timestamp.now()
    
    // 加入 timeout 機制
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Firestore 寫入超時（10秒）')), 10000)
    })
    
    // Build data object, filtering out undefined values
    const data: any = {
      title: prompt.title,
      prompt: prompt.prompt,
      types: prompt.types,
      category: prompt.category,
      specialty: prompt.specialty,
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
    
    const writePromise = addDoc(collection(db, COLLECTION_NAME), data)
    
    console.log('開始寫入 Firestore...')
    const docRef = await Promise.race([writePromise, timeoutPromise]) as any
    
    console.log('✅ Firestore 寫入成功，文件 ID:', docRef.id)
    return docRef.id
  } catch (error) {
    console.error('❌ Firestore 寫入失敗:', error)
    if (error instanceof Error) {
      console.error('錯誤訊息:', error.message)
      console.error('錯誤堆疊:', error.stack)
      console.error('錯誤類型:', error.constructor.name)
    }
    throw error
  }
}

/**
 * Delete a shared prompt
 */
export async function deleteSharedPrompt(id: string): Promise<void> {
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
  try {
    const docRef = doc(db, COLLECTION_NAME, id)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      const currentCount = docSnap.data().usageCount || 0
      await updateDoc(docRef, {
        usageCount: currentCount + 1,
      })
    }
  } catch (error) {
    console.error('Error incrementing prompt usage:', error)
    // Don't throw - this is not critical
  }
}
