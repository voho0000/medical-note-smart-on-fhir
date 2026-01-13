// Usage Tracker for Firebase
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import { QUOTA_CONFIG } from '@/src/shared/config/quota.config'

// Get today's date string (YYYY-MM-DD)
const getTodayString = () => new Date().toISOString().split('T')[0]

/**
 * Track API usage for a user
 * @param uid User ID
 * @returns true if usage was tracked successfully, false if daily limit exceeded
 */
export async function trackUsage(uid: string): Promise<boolean> {
  if (!db) return false

  try {
    const today = getTodayString()
    const usageRef = doc(db, 'users', uid, 'usage', today)
    
    await setDoc(usageRef, {
      count: increment(1),
      date: today,
      lastUpdated: new Date().toISOString(),
    }, { merge: true })
    
    return true
  } catch {
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
  } catch {
    return 0
  }
}

/**
 * Check if user has remaining quota
 * @param uid User ID
 * @param dailyLimit Daily limit
 * @returns true if user has remaining quota
 */
export async function hasRemainingQuota(uid: string, dailyLimit: number = QUOTA_CONFIG.DAILY_LIMIT): Promise<boolean> {
  const currentUsage = await getCurrentUsage(uid)
  return currentUsage < dailyLimit
}
