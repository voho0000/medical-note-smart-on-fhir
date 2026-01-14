// Template Sync with Firestore
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
  type Unsubscribe
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'

export interface PromptTemplate {
  id: string
  label: string
  description?: string
  content: string
  createdAt?: Date
  updatedAt?: Date
}

interface FirestoreTemplate {
  id: string
  label: string
  description?: string
  content: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * Get all templates for a user
 */
export async function getUserTemplates(userId: string): Promise<PromptTemplate[]> {
  if (!db) return []

  try {
    const templatesRef = collection(db, 'users', userId, 'templates')
    const q = query(templatesRef, orderBy('createdAt', 'asc'))
    const snapshot = await getDocs(q)
    
    return snapshot.docs.map(doc => {
      const data = doc.data() as FirestoreTemplate
      return {
        id: doc.id,
        label: data.label,
        description: data.description,
        content: data.content,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      }
    })
  } catch (error) {
    console.error('[Template Sync] Error loading templates:', error)
    return []
  }
}

/**
 * Save or update a template
 */
export async function saveTemplate(
  userId: string, 
  template: PromptTemplate
): Promise<boolean> {
  if (!db) return false

  try {
    const templateRef = doc(db, 'users', userId, 'templates', template.id)
    const now = Timestamp.now()
    
    await setDoc(templateRef, {
      id: template.id,
      label: template.label,
      description: template.description || '',
      content: template.content,
      createdAt: template.createdAt ? Timestamp.fromDate(template.createdAt) : now,
      updatedAt: now,
    })
    
    return true
  } catch (error) {
    console.error('[Template Sync] Error saving template:', error)
    return false
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(
  userId: string, 
  templateId: string
): Promise<boolean> {
  if (!db) return false

  try {
    const templateRef = doc(db, 'users', userId, 'templates', templateId)
    await deleteDoc(templateRef)
    return true
  } catch (error) {
    console.error('[Template Sync] Error deleting template:', error)
    return false
  }
}

/**
 * Subscribe to real-time template updates
 */
export function subscribeToTemplates(
  userId: string,
  onUpdate: (templates: PromptTemplate[]) => void
): Unsubscribe {
  if (!db) return () => {}

  const templatesRef = collection(db, 'users', userId, 'templates')
  const q = query(templatesRef, orderBy('createdAt', 'asc'))
  
  return onSnapshot(q, (snapshot) => {
    const templates = snapshot.docs.map(doc => {
      const data = doc.data() as FirestoreTemplate
      return {
        id: doc.id,
        label: data.label,
        description: data.description,
        content: data.content,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      }
    })
    onUpdate(templates)
  }, (error) => {
    console.error('[Template Sync] Error in subscription:', error)
  })
}

/**
 * Batch save multiple templates (for migration)
 */
export async function batchSaveTemplates(
  userId: string,
  templates: PromptTemplate[]
): Promise<boolean> {
  if (!db) return false

  try {
    const promises = templates.map(template => saveTemplate(userId, template))
    await Promise.all(promises)
    return true
  } catch (error) {
    console.error('[Template Sync] Error batch saving templates:', error)
    return false
  }
}
