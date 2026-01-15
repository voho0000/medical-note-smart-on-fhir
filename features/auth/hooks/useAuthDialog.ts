// Auth Dialog State Management Hook
import { useState } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { getAuthErrorMessage } from '@/src/infrastructure/firebase/auth-errors'

export type AuthMode = 'signin' | 'signup' | 'reset'

export interface AuthError {
  title: string
  message: string
}

export function useAuthDialog(onClose: () => void) {
  const { t, locale } = useLanguage()
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, loading } = useAuth()
  
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  const resetState = () => {
    setMode('signin')
    setEmail('')
    setPassword('')
    setShowPassword(false)
    setError(null)
    setResetEmailSent(false)
    setSignUpSuccess(false)
  }

  const handleGoogleSignIn = async () => {
    try {
      setError(null)
      await signInWithGoogle()
      onClose()
    } catch (err) {
      const errorMsg = getAuthErrorMessage(err, locale)
      setError(errorMsg)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError({
        title: t.auth.fillAllFieldsTitle,
        message: t.auth.fillAllFieldsMessage
      })
      return
    }

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
        onClose()
        setEmail('')
        setPassword('')
      } else {
        await signUpWithEmail(email, password)
        setSignUpSuccess(true)
        setEmail('')
        setPassword('')
      }
    } catch (err) {
      const errorMsg = getAuthErrorMessage(err, locale)
      setError(errorMsg)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email) {
      setError({
        title: t.auth.emailRequiredTitle,
        message: t.auth.emailRequiredMessage
      })
      return
    }

    try {
      await resetPassword(email)
      setResetEmailSent(true)
    } catch (err) {
      const errorMsg = getAuthErrorMessage(err, locale)
      setError(errorMsg)
    }
  }

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError(null)
    setResetEmailSent(false)
    setSignUpSuccess(false)
  }

  const switchToReset = () => {
    setMode('reset')
    setError(null)
    setResetEmailSent(false)
    setSignUpSuccess(false)
  }

  const switchToSignIn = () => {
    setMode('signin')
    setError(null)
    setResetEmailSent(false)
    setSignUpSuccess(false)
  }

  return {
    mode,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    error,
    resetEmailSent,
    signUpSuccess,
    loading,
    resetState,
    handleGoogleSignIn,
    handleEmailAuth,
    handleResetPassword,
    toggleMode,
    switchToReset,
    switchToSignIn,
  }
}
