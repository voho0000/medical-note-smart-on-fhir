/**
 * Login Required Dialog
 * Shows when user tries to share without being logged in
 */

import { useState } from 'react'
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
import { AuthDialog } from '@/features/auth/components/AuthDialog'

interface LoginRequiredDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LoginRequiredDialog({
  open,
  onOpenChange,
}: LoginRequiredDialogProps) {
  const { t } = useLanguage()
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  const handleLogin = () => {
    onOpenChange(false)
    setShowAuthDialog(true)
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>需要登入</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>此功能需要登入才能使用。</p>
              <p className="text-sm">登入後您可以：</p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                <li>分享您的模板給其他使用者</li>
                <li>儲存模板到您的帳號</li>
                <li>管理您分享的模板</li>
                <li>追蹤模板的使用情況</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogin}>前往登入</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </>
  )
}
