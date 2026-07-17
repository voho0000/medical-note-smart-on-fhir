'use client'

// Firebase-free identity adapter selected only by the on-prem build profile.

import { createContext, useContext, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { clearSessionKey } from '@/src/shared/utils/crypto.utils'
import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import { purgeAiResultCaches } from '@/src/infrastructure/cache/encrypted-session-cache'
import { notifyBundleChanged } from '@/src/shared/utils/reset-on-bundle-change'

export interface User {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  emailVerified: boolean
}

export interface AuthContextType {
  user: User | null
  isAnonymous: boolean
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  dailyUsage: number
  dailyLimit: number
  perplexityUsage: number
  whisperUsage: number
  perplexityLimit: number
  whisperLimit: number
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const cloudAuthUnavailable = async (): Promise<void> => {
  throw new Error('Account sign-in is disabled by the onprem deployment profile')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const signOut = async () => {
    useAiConfigStore.getState().clearAllKeys()
    clearSessionKey()
    await LocalBundleService.clear()
    purgeAiResultCaches()
    notifyBundleChanged()
    await queryClient.invalidateQueries()
  }

  const value: AuthContextType = {
    user: null,
    isAnonymous: false,
    loading: false,
    signInWithGoogle: cloudAuthUnavailable,
    signInWithEmail: cloudAuthUnavailable,
    signUpWithEmail: cloudAuthUnavailable,
    signOut,
    resetPassword: cloudAuthUnavailable,
    dailyUsage: 0,
    dailyLimit: 0,
    perplexityUsage: 0,
    whisperUsage: 0,
    perplexityLimit: 0,
    whisperLimit: 0,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
