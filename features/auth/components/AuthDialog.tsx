// Authentication Dialog Component - Refactored
'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuthDialog } from '../hooks/useAuthDialog'
import { GoogleSignInButton } from './GoogleSignInButton'
import { BenefitsSection } from './BenefitsSection'
import { EmailPasswordForm } from './EmailPasswordForm'
import { SuccessMessage } from './SuccessMessage'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const { t, locale } = useLanguage()
  
  const {
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
  } = useAuthDialog(() => onOpenChange(false))

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
    if (!newOpen) {
      resetState()
    }
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
            <SuccessMessage
              title={t.auth.signUpSuccess}
              description={t.auth.signUpSuccessMessage}
              buttonLabel={t.auth.startUsing}
              onClose={() => onOpenChange(false)}
              variant="success"
            />
          )}

          {/* Reset Password Success Message */}
          {mode === 'reset' && resetEmailSent && (
            <SuccessMessage
              title={t.auth.resetEmailSent}
              description={t.auth.resetEmailSentMessage}
              buttonLabel=""
              onClose={() => {}}
              variant="info"
            />
          )}

          {/* Benefits - Hide in reset mode and signup success */}
          {mode !== 'reset' && !signUpSuccess && (
            <BenefitsSection
              title={t.auth.benefits}
              benefits={[t.auth.benefit1, t.auth.benefit2, t.auth.benefit3]}
            />
          )}

          {/* Google Sign In - Hide in reset mode and signup success */}
          {mode !== 'reset' && !signUpSuccess && (
            <>
              <GoogleSignInButton
                onClick={handleGoogleSignIn}
                loading={loading}
                label={t.auth.signInWithGoogle}
              />

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
            <EmailPasswordForm
              mode={mode}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              error={error}
              loading={loading}
              resetEmailSent={resetEmailSent}
              onSubmit={mode === 'reset' ? handleResetPassword : handleEmailAuth}
              onSwitchToReset={switchToReset}
              emailLabel={t.auth.email}
              passwordLabel={t.auth.password}
              forgotPasswordLabel={t.auth.forgotPassword}
              submitLabel={mode === 'reset' ? t.auth.sendResetLink : mode === 'signin' ? t.auth.signIn : t.auth.signUp}
              showPasswordLabel={t.auth.showPassword}
              hidePasswordLabel={t.auth.hidePassword}
            />
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
