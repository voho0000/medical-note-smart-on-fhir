// Authentication Provider with Firebase
'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  GoogleAuthProvider,
  type User as FirebaseUser
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/src/shared/config/firebase.config'
import { QUOTA_CONFIG } from '@/src/shared/config/quota.config'

export interface User {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  dailyUsage: number
  dailyLimit: number
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Helper: Convert Firebase User to our User type
const convertFirebaseUser = (firebaseUser: FirebaseUser): User => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
})

// Helper: Get today's date string (YYYY-MM-DD)
const getTodayString = () => new Date().toISOString().split('T')[0]

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [dailyUsage, setDailyUsage] = useState(0)
  const dailyLimit = QUOTA_CONFIG.DAILY_LIMIT

  // Load user's daily usage from Firestore
  const loadDailyUsage = async (uid: string) => {
    if (!db) {
      console.warn('Firestore not initialized')
      setDailyUsage(0)
      return
    }
    
    try {
      const today = getTodayString()
      const usageRef = doc(db, 'users', uid, 'usage', today)
      const usageDoc = await getDoc(usageRef)
      
      if (usageDoc.exists()) {
        setDailyUsage(usageDoc.data().count || 0)
      } else {
        setDailyUsage(0)
      }
    } catch {
      setDailyUsage(0)
    }
  }

  // Firebase Auth state listener
  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const convertedUser = convertFirebaseUser(firebaseUser)
        setUser(convertedUser)
        
        // Create user document if it doesn't exist (with error handling)
        if (db) {
          try {
            const userRef = doc(db, 'users', firebaseUser.uid)
            const userDoc = await getDoc(userRef)
            if (!userDoc.exists()) {
              await setDoc(userRef, {
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL,
                createdAt: new Date().toISOString(),
              })
            }
            
            // Load initial usage
            await loadDailyUsage(firebaseUser.uid)
          } catch {
            // Silently handle errors (offline, permissions, etc.)
          }
        }
      } else {
        setUser(null)
        setDailyUsage(0)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Real-time usage listener
  useEffect(() => {
    if (!user || !db) return

    const today = getTodayString()
    const usageRef = doc(db, 'users', user.uid, 'usage', today)
    
    const unsubscribe = onSnapshot(
      usageRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setDailyUsage(snapshot.data().count || 0)
        } else {
          setDailyUsage(0)
        }
      },
      () => {}
    )

    return () => unsubscribe()
  }, [user])

  // Sign in with Google
  const signInWithGoogle = async () => {
    if (!auth) throw new Error('Firebase not initialized')
    
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      // User state will be updated by onAuthStateChanged listener
    } finally {
      setLoading(false)
    }
  }

  // Sign in with Email
  const signInWithEmail = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not initialized')
    
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      // User state will be updated by onAuthStateChanged listener
    } finally {
      setLoading(false)
    }
  }

  // Sign up with Email
  const signUpWithEmail = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not initialized')
    
    setLoading(true)
    try {
      await createUserWithEmailAndPassword(auth, email, password)
      // User state will be updated by onAuthStateChanged listener
    } finally {
      setLoading(false)
    }
  }

  // Sign out
  const signOut = async () => {
    if (!auth) throw new Error('Firebase not initialized')
    
    setLoading(true)
    try {
      await firebaseSignOut(auth)
      // User state will be updated by onAuthStateChanged listener
    } finally {
      setLoading(false)
    }
  }

  // Reset password
  const resetPassword = async (email: string) => {
    if (!auth) throw new Error('Firebase not initialized')
    
    await sendPasswordResetEmail(auth, email)
  }

  const value: AuthContextType = {
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    dailyUsage,
    dailyLimit,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
