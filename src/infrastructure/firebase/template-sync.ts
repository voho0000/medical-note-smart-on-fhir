// Chat Template Sync with Firestore
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

export interface ChatTemplate {
  id: string
  label: string
  content: string
  order: number
  createdAt?: Date
  updatedAt?: Date
}

interface FirestoreChatTemplate {
  id: string
  label: string
  content: string
  order: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * Get all chat templates for a user
 */
export async function getUserChatTemplates(userId: string): Promise<ChatTemplate[]> {
  if (!db) return []

  try {
    const templatesRef = collection(db, 'users', userId, 'chatTemplates')
    const q = query(templatesRef, orderBy('order', 'asc'))
    const snapshot = await getDocs(q)
    
    return snapshot.docs.map(doc => {
      const data = doc.data() as FirestoreChatTemplate
      return {
        id: doc.id,
        label: data.label,
        content: data.content,
        order: data.order || 0,
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
 * Save or update a chat template
 */
export async function saveChatTemplate(
  userId: string, 
  template: ChatTemplate
): Promise<boolean> {
  if (!db) return false

  try {
    const templateRef = doc(db, 'users', userId, 'chatTemplates', template.id)
    const now = Timestamp.now()
    
    await setDoc(templateRef, {
      id: template.id,
      label: template.label,
      content: template.content,
      order: template.order,
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
 * Delete a chat template
 */
export async function deleteChatTemplate(
  userId: string, 
  templateId: string
): Promise<boolean> {
  if (!db) return false

  try {
    const templateRef = doc(db, 'users', userId, 'chatTemplates', templateId)
    await deleteDoc(templateRef)
    return true
  } catch (error) {
    console.error('[Template Sync] Error deleting template:', error)
    return false
  }
}

/**
 * Subscribe to real-time chat template updates
 */
export function subscribeToChatTemplates(
  userId: string,
  onUpdate: (templates: ChatTemplate[]) => void
): Unsubscribe {
  if (!db) return () => {}

  const templatesRef = collection(db, 'users', userId, 'chatTemplates')
  const q = query(templatesRef, orderBy('order', 'asc'))
  
  return onSnapshot(q, (snapshot) => {
    const templates = snapshot.docs.map(doc => {
      const data = doc.data() as FirestoreChatTemplate
      return {
        id: doc.id,
        label: data.label,
        content: data.content,
        order: data.order || 0,
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
 * Batch save multiple chat templates (for migration)
 */
export async function batchSaveChatTemplates(
  userId: string,
  templates: ChatTemplate[]
): Promise<boolean> {
  if (!db) return false

  try {
    const promises = templates.map(template => saveChatTemplate(userId, template))
    await Promise.all(promises)
    return true
  } catch (error) {
    console.error('[Template Sync] Error batch saving templates:', error)
    return false
  }
}

/**
 * Replace all chat templates (delete all existing, then save new ones)
 */
export async function replaceAllChatTemplates(
  userId: string,
  templates: ChatTemplate[]
): Promise<boolean> {
  if (!db) return false

  try {
    // First, get all existing templates
    const existingTemplates = await getUserChatTemplates(userId)
    
    // Delete all existing templates
    const deletePromises = existingTemplates.map(template => 
      deleteChatTemplate(userId, template.id)
    )
    await Promise.all(deletePromises)
    
    // Then save new templates
    const savePromises = templates.map(template => saveChatTemplate(userId, template))
    await Promise.all(savePromises)
    
    return true
  } catch (error) {
    console.error('[Template Sync] Error replacing templates:', error)
    return false
  }
}
