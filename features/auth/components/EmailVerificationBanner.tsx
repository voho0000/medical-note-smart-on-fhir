// Email Verification Banner Component
'use client'

import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, X } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { sendEmailVerification } from 'firebase/auth'
import { auth } from '@/src/shared/config/firebase.config'

export function EmailVerificationBanner() {
  const { locale } = useLanguage()
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [checking, setChecking] = useState(false)

  // Don't show if user is verified, not logged in, or dismissed
  if (!user || user.emailVerified || dismissed) {
    return null
  }

  const handleResendEmail = async () => {
    if (!auth.currentUser) return
    
    setSending(true)
    try {
      await sendEmailVerification(auth.currentUser)
      setSent(true)
      setTimeout(() => setSent(false), 5000) // Hide success message after 5s
    } catch (error) {
      console.error('Failed to resend verification email:', error)
    } finally {
      setSending(false)
    }
  }

  const handleCheckVerification = async () => {
    if (!auth.currentUser) return
    
    setChecking(true)
    try {
      // Reload user to get latest emailVerified status
      await auth.currentUser.reload()
      // Force a re-render by reloading the page if verified
      if (auth.currentUser.emailVerified) {
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to check verification status:', error)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 relative">
      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-2 top-2 rounded-sm opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
      <AlertTitle className="text-amber-800 dark:text-amber-200">
        {locale === 'zh-TW' ? '請驗證您的 Email' : 'Please Verify Your Email'}
      </AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        {locale === 'zh-TW' 
          ? '您的 Email 尚未驗證。請檢查您的信箱（包括垃圾郵件）並點擊驗證連結。驗證後可以確保您的資料安全並享有完整功能。' 
          : 'Your email is not verified yet. Please check your inbox (including spam folder) and click the verification link. Verification ensures your data security and full access to features.'}
      </AlertDescription>
      <div className="flex flex-wrap gap-2 mt-2">
        {sent ? (
          <p className="text-sm text-green-600 dark:text-green-400">
            {locale === 'zh-TW' ? '✓ 驗證信已重新發送！' : '✓ Verification email resent!'}
          </p>
        ) : (
          <>
            <Button
              onClick={handleCheckVerification}
              disabled={checking}
              variant="outline"
              size="sm"
              className="border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950"
            >
              {checking 
                ? (locale === 'zh-TW' ? '檢查中...' : 'Checking...') 
                : (locale === 'zh-TW' ? '我已驗證' : 'I\'ve Verified')}
            </Button>
            <Button
              onClick={handleResendEmail}
              disabled={sending}
              variant="outline"
              size="sm"
              className="border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900"
            >
              {sending 
                ? (locale === 'zh-TW' ? '發送中...' : 'Sending...') 
                : (locale === 'zh-TW' ? '重新發送驗證信' : 'Resend Email')}
            </Button>
          </>
        )}
      </div>
    </Alert>
  )
}
