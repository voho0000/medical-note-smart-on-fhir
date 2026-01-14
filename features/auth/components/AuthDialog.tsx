// Authentication Dialog Component
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { getAuthErrorMessage } from '@/src/infrastructure/firebase/auth-errors'
import { Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { t, locale } = useLanguage()
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  // Reset state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      // Reset all state when dialog closes
      setMode('signin')
      setEmail('')
      setPassword('')
      setError(null)
      setResetEmailSent(false)
      setSignUpSuccess(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      setError(null)
      await signInWithGoogle()
      onOpenChange(false)
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
        title: locale === 'zh-TW' ? '請填寫所有欄位' : 'Fill All Fields',
        message: t.auth.fillAllFields
      })
      return
    }

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
        onOpenChange(false)
        setEmail('')
        setPassword('')
      } else {
        await signUpWithEmail(email, password)
        // Show success message instead of closing immediately
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
        title: locale === 'zh-TW' ? '請輸入 Email' : 'Email Required',
        message: locale === 'zh-TW' ? '請輸入您的 Email 地址' : 'Please enter your email address'
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'reset' ? t.auth.resetPasswordTitle : mode === 'signin' ? t.auth.signInTitle : t.auth.signUpTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === 'reset' ? t.auth.resetPasswordDescription : t.auth.freeQuotaDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Sign Up Success Message */}
          {mode === 'signup' && signUpSuccess && (
            <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
              <AlertCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
              <AlertTitle className="text-green-800 dark:text-green-200">
                {locale === 'zh-TW' ? '註冊成功！' : 'Sign Up Successful!'}
              </AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-300">
                {locale === 'zh-TW' 
                  ? '驗證信已發送到您的信箱，請檢查收件匣（或垃圾郵件）並點擊連結完成驗證。您現在可以開始使用系統。' 
                  : 'A verification email has been sent to your inbox. Please check your email (including spam folder) and click the link to verify. You can start using the system now.'}
              </AlertDescription>
              <Button 
                onClick={() => onOpenChange(false)} 
                className="mt-3 w-full"
                variant="default"
              >
                {locale === 'zh-TW' ? '開始使用' : 'Start Using'}
              </Button>
            </Alert>
          )}

          {/* Reset Password Success Message */}
          {mode === 'reset' && resetEmailSent && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t.auth.resetEmailSent}</AlertTitle>
              <AlertDescription>{t.auth.resetEmailSentMessage}</AlertDescription>
            </Alert>
          )}

          {/* Benefits - Hide in reset mode and signup success */}
          {mode !== 'reset' && !signUpSuccess && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium mb-1">✨ {t.auth.benefits}</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• {t.auth.benefit1}</li>
                <li>• {t.auth.benefit2}</li>
                <li>• {t.auth.benefit3}</li>
              </ul>
            </div>
          )}

          {/* Google Sign In - Hide in reset mode and signup success */}
          {mode !== 'reset' && !signUpSuccess && (
            <>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                {t.auth.signInWithGoogle}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t.auth.orContinueWith}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Email/Password Form or Reset Password Form - Hide on signup success */}
          {!signUpSuccess && (
          <form onSubmit={mode === 'reset' ? handleResetPassword : handleEmailAuth} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="email">{t.auth.email}</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            {/* Password field - Hide in reset mode */}
            {mode !== 'reset' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t.auth.password}</Label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={switchToReset}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      {t.auth.forgotPassword}
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{error.title}</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading || (mode === 'reset' && resetEmailSent)}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'reset' ? t.auth.sendResetLink : mode === 'signin' ? t.auth.signIn : t.auth.signUp}
            </Button>
          </form>
          )}

          {/* Toggle Mode or Back to Sign In */}
          <div className="text-center text-sm space-y-2">
            {mode === 'reset' ? (
              <button
                type="button"
                onClick={switchToSignIn}
                className="text-muted-foreground hover:text-foreground underline"
                disabled={loading}
              >
                {t.auth.backToSignIn}
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleMode}
                className="text-muted-foreground hover:text-foreground underline"
                disabled={loading}
              >
                {mode === 'signin' ? t.auth.noAccount : t.auth.hasAccount}
              </button>
            )}
          </div>

          {/* Terms - Hide in reset mode */}
          {mode !== 'reset' && (
            <p className="text-xs text-center text-muted-foreground">
              {t.auth.termsNotice}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
