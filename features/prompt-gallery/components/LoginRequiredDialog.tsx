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
  onLoginSuccess?: () => void
}

export function LoginRequiredDialog({
  open,
  onOpenChange,
  title,
  description,
  features,
  onLoginSuccess,
}: LoginRequiredDialogProps) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [wasLoggedOut, setWasLoggedOut] = useState(true)

  // Track initial login state when dialog opens
  useEffect(() => {
    if (open) {
      setWasLoggedOut(!user)
    }
  }, [open])

  // Detect when user successfully logs in
  useEffect(() => {
    if (user && wasLoggedOut && showAuthDialog) {
      // User just logged in successfully
      setShowAuthDialog(false)
      onOpenChange(false)
      
      // Execute callback after a short delay to ensure dialog closes
      if (onLoginSuccess) {
        setTimeout(() => {
          onLoginSuccess()
        }, 100)
      }
    }
  }, [user, wasLoggedOut, showAuthDialog, onLoginSuccess, onOpenChange])

  const handleLogin = () => {
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
                <div className="text-sm">{t.promptGallery.loginBenefits}</div>
                <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                  {(features || defaultFeatures).map((feature, index) => (
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogin}>{t.promptGallery.goToLogin}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </>
  )
}
