// Clinical Insights Panel Sync with Firestore
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

export interface ClinicalInsightPanel {
  id: string
  title: string
  prompt: string
  autoGenerate: boolean
  order: number
  createdAt?: Date
  updatedAt?: Date
}

interface FirestoreClinicalInsightPanel {
  id: string
  title: string
  prompt: string
  autoGenerate: boolean
  order: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * Get all clinical insight panels for a user
 */
export async function getUserClinicalInsightPanels(userId: string): Promise<ClinicalInsightPanel[]> {
  if (!db) return []

  try {
    const panelsRef = collection(db, 'users', userId, 'clinicalInsightPanels')
    const q = query(panelsRef, orderBy('order', 'asc'))
    const snapshot = await getDocs(q)
    
    return snapshot.docs.map(doc => {
      const data = doc.data() as FirestoreClinicalInsightPanel
      return {
        id: doc.id,
        title: data.title,
        prompt: data.prompt,
        autoGenerate: data.autoGenerate || false,
        order: data.order || 0,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      }
    })
  } catch (error) {
    console.error('[Clinical Insights Sync] Error loading panels:', error)
    return []
  }
}

/**
 * Save or update a clinical insight panel
 */
export async function saveClinicalInsightPanel(
  userId: string, 
  panel: ClinicalInsightPanel
): Promise<boolean> {
  if (!db) return false

  try {
    const panelRef = doc(db, 'users', userId, 'clinicalInsightPanels', panel.id)
    const now = Timestamp.now()
    
    await setDoc(panelRef, {
      id: panel.id,
      title: panel.title,
      prompt: panel.prompt,
      autoGenerate: panel.autoGenerate,
      order: panel.order,
      createdAt: panel.createdAt ? Timestamp.fromDate(panel.createdAt) : now,
      updatedAt: now,
    })
    
    return true
  } catch (error) {
    console.error('[Clinical Insights Sync] Error saving panel:', error)
    return false
  }
}

/**
 * Delete a clinical insight panel
 */
export async function deleteClinicalInsightPanel(
  userId: string, 
  panelId: string
): Promise<boolean> {
  if (!db) return false

  try {
    const panelRef = doc(db, 'users', userId, 'clinicalInsightPanels', panelId)
    await deleteDoc(panelRef)
    return true
  } catch (error) {
    console.error('[Clinical Insights Sync] Error deleting panel:', error)
    return false
  }
}

/**
 * Subscribe to real-time clinical insight panel updates
 */
export function subscribeToClinicalInsightPanels(
  userId: string,
  onUpdate: (panels: ClinicalInsightPanel[]) => void
): Unsubscribe {
  if (!db) return () => {}

  const panelsRef = collection(db, 'users', userId, 'clinicalInsightPanels')
  const q = query(panelsRef, orderBy('order', 'asc'))
  
  return onSnapshot(q, (snapshot) => {
    const panels = snapshot.docs.map(doc => {
      const data = doc.data() as FirestoreClinicalInsightPanel
      return {
        id: doc.id,
        title: data.title,
        prompt: data.prompt,
        autoGenerate: data.autoGenerate || false,
        order: data.order || 0,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      }
    })
    onUpdate(panels)
  }, (error) => {
    console.error('[Clinical Insights Sync] Error in subscription:', error)
  })
}

/**
 * Batch save multiple clinical insight panels (for migration)
 */
export async function batchSaveClinicalInsightPanels(
  userId: string,
  panels: ClinicalInsightPanel[]
): Promise<boolean> {
  if (!db) return false

  try {
    const promises = panels.map(panel => saveClinicalInsightPanel(userId, panel))
    await Promise.all(promises)
    return true
  } catch (error) {
    console.error('[Clinical Insights Sync] Error batch saving panels:', error)
    return false
  }
}

/**
 * Replace all clinical insight panels (delete all existing, then save new ones)
 */
export async function replaceAllClinicalInsightPanels(
  userId: string,
  panels: ClinicalInsightPanel[]
): Promise<boolean> {
  if (!db) return false

  try {
    // First, get all existing panels
    const existingPanels = await getUserClinicalInsightPanels(userId)
    
    // Delete all existing panels
    const deletePromises = existingPanels.map(panel => 
      deleteClinicalInsightPanel(userId, panel.id)
    )
    await Promise.all(deletePromises)
    
    // Then save new panels
    const savePromises = panels.map(panel => saveClinicalInsightPanel(userId, panel))
    await Promise.all(savePromises)
    
    return true
  } catch (error) {
    console.error('[Clinical Insights Sync] Error replacing panels:', error)
    return false
  }
}
