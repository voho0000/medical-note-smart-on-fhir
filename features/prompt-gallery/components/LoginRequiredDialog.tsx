/**
 * Login Required Dialog
 * Shows when user tries to use features that require authentication
 */

import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { AuthDialog } from '@/features/auth/components/AuthDialog'

interface LoginRequiredDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  features?: string[]
  showBenefits?: boolean
  cancelLabel?: string
  loginLabel?: string
  onCancel?: () => void
  onLoginStart?: () => void
  onLoginSuccess?: () => void
}

export function LoginRequiredDialog({
  open,
  onOpenChange,
  title,
  description,
  features,
  showBenefits = true,
  cancelLabel,
  loginLabel,
  onCancel,
  onLoginStart,
  onLoginSuccess,
}: LoginRequiredDialogProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  // Detect when user successfully logs in
  useEffect(() => {
    if (user && showAuthDialog) {
      // User just logged in successfully
      // Firebase auth is an external subscription; close the nested dialog
      // when that subscription reports a successful login.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAuthDialog(false)
      onOpenChange(false)
      
      // Execute callback after a short delay to ensure dialog closes
      if (onLoginSuccess) {
        setTimeout(() => {
          onLoginSuccess()
        }, 100)
      }
    }
  }, [user, showAuthDialog, onLoginSuccess, onOpenChange])

  const handleLogin = () => {
    onLoginStart?.()
    onOpenChange(false)
    setShowAuthDialog(true)
  }

  const defaultFeatures = [
    t.promptGallery.loginFeature1,
    t.promptGallery.loginFeature2,
    t.promptGallery.loginFeature3,
    t.promptGallery.loginFeature4,
  ]

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title || t.promptGallery.loginRequired}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>{description || t.promptGallery.loginRequiredDesc}</div>
                {showBenefits ? (
                  <>
                    <div className="text-sm">{t.promptGallery.loginBenefits}</div>
                    <ul className="ml-2 list-inside list-disc space-y-1 text-sm">
                      {(features || defaultFeatures).map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>{cancelLabel || t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogin}>{loginLabel || t.promptGallery.goToLogin}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </>
  )
}
