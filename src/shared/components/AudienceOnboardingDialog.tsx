// Audience Onboarding Dialog — shown on first visit to ask whether the user is a medical professional or a patient.
"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { Stethoscope, User } from 'lucide-react'

export function AudienceOnboardingDialog() {
  const { hasSelected, setAudience } = useAudience()
  const { t } = useLanguage()

  return (
    <Dialog open={!hasSelected}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.audience.onboarding.title}</DialogTitle>
          <DialogDescription>{t.audience.onboarding.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          <button
            type="button"
            onClick={() => setAudience('medical')}
            className="group flex flex-col items-start gap-3 rounded-lg border-2 border-border p-5 text-left transition-colors hover:border-primary hover:bg-accent focus:border-primary focus:outline-none"
          >
            <Stethoscope className="h-8 w-8 text-blue-600 group-hover:text-primary" />
            <div className="space-y-1">
              <div className="font-semibold">{t.audience.onboarding.medicalCardTitle}</div>
              <div className="text-sm text-muted-foreground">{t.audience.onboarding.medicalCardDescription}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setAudience('patient')}
            className="group flex flex-col items-start gap-3 rounded-lg border-2 border-border p-5 text-left transition-colors hover:border-primary hover:bg-accent focus:border-primary focus:outline-none"
          >
            <User className="h-8 w-8 text-purple-600 group-hover:text-primary" />
            <div className="space-y-1">
              <div className="font-semibold">{t.audience.onboarding.patientCardTitle}</div>
              <div className="text-sm text-muted-foreground">{t.audience.onboarding.patientCardDescription}</div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
