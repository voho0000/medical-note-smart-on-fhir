// Usage Tracker for Firebase
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'

// Get today's date string (YYYY-MM-DD)
const getTodayString = () => new Date().toISOString().split('T')[0]

/**
 * Track API usage for a user
 * @param uid User ID
 * @returns true if usage was tracked successfully, false if daily limit exceeded
 */
export async function trackUsage(uid: string, dailyLimit: number = 20): Promise<boolean> {
  try {
    const today = getTodayString()
    const usageRef = doc(db, 'users', uid, 'usage', today)
    const usageDoc = await getDoc(usageRef)

    if (usageDoc.exists()) {
      const currentCount = usageDoc.data().count || 0
      
      // Check if limit exceeded
      if (currentCount >= dailyLimit) {
        return false
      }
      
      // Increment usage
      await updateDoc(usageRef, {
        count: increment(1),
        lastUpdated: new Date().toISOString(),
      })
    } else {
      // Create new usage document
      await setDoc(usageRef, {
        count: 1,
        date: today,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      })
    }
    
    return true
  } catch (error) {
    console.error('Error tracking usage:', error)
    return false
  }
}

/**
 * Get current usage for a user
 * @param uid User ID
 * @returns Current usage count
 */
export async function getCurrentUsage(uid: string): Promise<number> {
  try {
    const today = getTodayString()
    const usageRef = doc(db, 'users', uid, 'usage', today)
    const usageDoc = await getDoc(usageRef)
    
    if (usageDoc.exists()) {
      return usageDoc.data().count || 0
    }
    
    return 0
  } catch (error) {
    console.error('Error getting current usage:', error)
    return 0
  }
}

/**
 * Check if user has remaining quota
 * @param uid User ID
 * @param dailyLimit Daily limit
 * @returns true if user has remaining quota
 */
export async function hasRemainingQuota(uid: string, dailyLimit: number = 20): Promise<boolean> {
  const currentUsage = await getCurrentUsage(uid)
  return currentUsage < dailyLimit
}
