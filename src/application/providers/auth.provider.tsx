// Authentication Provider with Firebase
'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { 
  signInWithPopup,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  type User as FirebaseUser
} from 'firebase/auth'
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/src/shared/config/firebase.config'
import { QUOTA_CONFIG } from '@/src/shared/config/quota.config'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { clearSessionKey } from '@/src/shared/utils/crypto.utils'

export interface User {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  emailVerified: boolean
}

export interface AuthContextType {
  user: User | null
  /**
   * True when the active Firebase session is anonymous (a not-signed-in
   * visitor on the free tier). `user` is deliberately null in this case so
   * every login-gated feature (cloud history, prompt sharing, settings sync)
   * stays gated — only the proxy quota is opened up. Check this when you need
   * "is there a usable proxy token", not `user`.
   */
  isAnonymous: boolean
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  dailyUsage: number
  /** Daily chat limit for the active tier (smaller for anonymous visitors) */
  dailyLimit: number
  /** Per-service usage read from the same daily doc the Functions meter */
  perplexityUsage: number
  whisperUsage: number
  /** Per-service limits for the active tier (smaller for anonymous visitors) */
  perplexityLimit: number
  whisperLimit: number
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Helper: Convert Firebase User to our User type
const convertFirebaseUser = (firebaseUser: FirebaseUser): User => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
  emailVerified: firebaseUser.emailVerified,
})

// Helper: Get today's date string (YYYY-MM-DD)
const getTodayString = () => new Date().toISOString().split('T')[0]

// Helper: Detect if user is on mobile device
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAnonymous, setIsAnonymous] = useState(false)
  // uid of the active Firebase session (real OR anonymous) — drives the usage
  // listener. `user.uid` can't be used because it's null for anonymous.
  const [activeUid, setActiveUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dailyUsage, setDailyUsage] = useState(0)
  const [perplexityUsage, setPerplexityUsage] = useState(0)
  const [whisperUsage, setWhisperUsage] = useState(0)

  // Anonymous visitors get a smaller free allowance; these are display-only,
  // the Functions enforce the real numbers (must mirror ANON_LIMITS).
  const dailyLimit = isAnonymous ? QUOTA_CONFIG.ANON_DAILY_LIMIT : QUOTA_CONFIG.DAILY_LIMIT
  const perplexityLimit = isAnonymous ? QUOTA_CONFIG.ANON_PERPLEXITY_LIMIT : QUOTA_CONFIG.PERPLEXITY_DAILY_LIMIT
  const whisperLimit = isAnonymous ? QUOTA_CONFIG.ANON_WHISPER_LIMIT : QUOTA_CONFIG.WHISPER_DAILY_LIMIT

  // Handle redirect result on mount (for mobile Google sign-in)
  useEffect(() => {
    if (!auth) return
    
    const handleRedirect = async () => {
      try {
        // 不 log URL（redirect 期間可能含 auth code）與 email/UID — 共用工作站的 console 會留存
        await setPersistence(auth, browserLocalPersistence)

        const result = await getRedirectResult(auth)
        if (result) {
          // User successfully signed in via redirect
          // onAuthStateChanged will handle the rest
          console.log('[Auth] Redirect sign-in successful')
        }
      } catch (error: any) {
        console.error('[Auth] Redirect sign-in error:', error.code, error.message)
      }
    }
    
    handleRedirect()
  }, [])

  // Firebase Auth state listener
  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && !firebaseUser.isAnonymous) {
        // Real signed-in account
        setIsAnonymous(false)
        setActiveUid(firebaseUser.uid)
        setUser(convertFirebaseUser(firebaseUser))

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
          } catch {
            // Silently handle errors (offline, permissions, etc.)
          }
        }
      } else if (firebaseUser) {
        // Anonymous visitor (free tier). Keep `user` null so login-gated
        // features stay gated; only the proxy token + small quota are enabled.
        // No user document is created — the uid is disposable.
        setIsAnonymous(true)
        setActiveUid(firebaseUser.uid)
        setUser(null)
      } else {
        // No Firebase session at all → mint an anonymous one so the built-in
        // free model works without an explicit login. This fires
        // onAuthStateChanged again with the anonymous user (handled above).
        setUser(null)
        setIsAnonymous(false)
        setActiveUid(null)
        setDailyUsage(0)
        setPerplexityUsage(0)
        setWhisperUsage(0)
        signInAnonymously(auth).catch((error: { code?: string }) => {
          // auth/operation-not-allowed = Anonymous sign-in not enabled in the
          // Firebase Console (Authentication → Sign-in method). The app still
          // works with a user's own API key; the free proxy just won't.
          console.warn('[Auth] Anonymous sign-in unavailable:', error?.code)
        })
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Real-time usage listener — keyed on the active Firebase uid so it covers
  // anonymous visitors too (they meter against the same daily doc shape).
  useEffect(() => {
    if (!activeUid || !db) return

    const today = getTodayString()
    const usageRef = doc(db, 'users', activeUid, 'usage', today)

    const unsubscribe = onSnapshot(
      usageRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          setDailyUsage(data.count || 0)
          setPerplexityUsage(data.perplexityCount || 0)
          setWhisperUsage(data.whisperCount || 0)
        } else {
          setDailyUsage(0)
          setPerplexityUsage(0)
          setWhisperUsage(0)
        }
      },
      () => {}
    )

    return () => unsubscribe()
  }, [activeUid])

  // Sign in with Google
  const signInWithGoogle = async () => {
    if (!auth) throw new Error('Firebase not initialized')
    
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      
      // Add custom parameters to improve popup behavior
      provider.setCustomParameters({
        prompt: 'select_account',
        // Ensure popup closes after authentication
        display: 'popup'
      })
      
      const isMobile = isMobileDevice()
      console.log('[Auth] Starting Google sign-in, isMobile:', isMobile)
      console.log('[Auth] Using signInWithPopup')
      
      // Set persistence before sign-in
      await setPersistence(auth, browserLocalPersistence)
      
      await signInWithPopup(auth, provider)
      console.log('[Auth] Sign-in successful')
      setLoading(false)
    } catch (error: any) {
      console.error('[Auth] Google sign-in error:', error)
      console.error('[Auth] Error code:', error.code)
      console.error('[Auth] Error message:', error.message)
      
      // If popup was blocked or closed, provide helpful message
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('[Auth] User closed the popup')
      } else if (error.code === 'auth/popup-blocked') {
        console.log('[Auth] Popup was blocked by browser')
      }
      
      setLoading(false)
      throw error
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      // Send email verification
      await sendEmailVerification(userCredential.user)
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

      // Shared-workstation hygiene: logout also wipes locally stored LLM API
      // keys and the obfuscation key so the next user can't reuse them
      useAiConfigStore.getState().clearAllKeys()
      clearSessionKey()
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
    isAnonymous,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    dailyUsage,
    dailyLimit,
    perplexityUsage,
    whisperUsage,
    perplexityLimit,
    whisperLimit,
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
