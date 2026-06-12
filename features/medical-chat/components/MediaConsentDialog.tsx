// First-use consent dialog for image/voice uploads to LLM providers (audit B4)
"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLanguage } from "@/src/application/providers/language.provider"

interface MediaConsentDialogProps {
  open: boolean
  onAccept: () => void
  onCancel: () => void
}

export function MediaConsentDialog({ open, onAccept, onCancel }: MediaConsentDialogProps) {
  const { t } = useLanguage()

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.chat.mediaConsentTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.chat.mediaConsentBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t.chat.mediaConsentCancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onAccept}>{t.chat.mediaConsentAccept}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
