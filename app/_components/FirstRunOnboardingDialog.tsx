// First-run onboarding — a short stepper shown the first time clinical data is
// loaded (SMART launch / local bundle / demo all converge on `patient` becoming
// non-null). Shown once per browser, gated on the versioned
// `medical-note-onboarding-v1` flag.
//
// Currently: welcome + privacy, then the audience choice that shapes the whole
// UI. The sign-in step is HIDDEN, not deleted — flip SHOW_SIGN_IN_STEP back to
// true to restore it exactly as it was; signing in meanwhile stays available
// from the header account button.
//
// There is deliberately NO auto-AI question: automatic generation is off by
// default and is turned on from the 醫療摘要 header's 自動產生 switch.
"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Stethoscope, User, Sparkles, LogIn, Lock } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useOnboarding } from '@/src/application/hooks/onboarding/use-onboarding.hook'
import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'
import { AuthDialog } from '@/features/auth/components/AuthDialog'

/** Single switch for the hidden sign-in step. Set to true to bring it back. */
const SHOW_SIGN_IN_STEP = false

type StepId = 'welcome' | 'audience' | 'signIn'

interface FirstRunOnboardingDialogProps {
  /** Test seam only; production always reads the current page URL. */
  launchHref?: string
}

export function FirstRunOnboardingDialog({ launchHref }: FirstRunOnboardingDialogProps = {}) {
  const { t } = useLanguage()
  const ob = t.onboarding
  const { patient, loading: patientLoading, error: patientError } = usePatient()
  const { ready: onboardingReady, completed, markComplete } = useOnboarding()
  const { setAudience } = useAudience()
  const { user } = useAuth()
  const [stepIndex, setStepIndex] = useState(0)
  const [showAuth, setShowAuth] = useState(false)

  const dataLoaded = !!patient && !patientLoading && !patientError
  // The Medcloud launch is an unattended hand-off and must not be interrupted.
  const open = onboardingReady
    && dataLoaded
    && !completed
    && !isMedcloudLaunchRoute(launchHref)

  const steps: StepId[] = ['welcome', 'audience']
  if (SHOW_SIGN_IN_STEP && !user) steps.push('signIn')

  // AuthDialog is always rendered so a 登入 choice (which closes this flow
  // first) can still surface it afterwards.
  const authDialog = <AuthDialog open={showAuth} onOpenChange={setShowAuth} />

  if (!open) return authDialog

  const safeStepIndex = Math.min(stepIndex, steps.length - 1)
  const step = steps[safeStepIndex]
  const isLast = safeStepIndex === steps.length - 1
  const goNext = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0))
  const finish = () => {
    setStepIndex(0)
    markComplete()
  }
  // The audience cards are the step's own primary action, so when audience is
  // the last step picking one completes onboarding outright.
  const chooseAudience = (value: 'medical' | 'patient') => {
    setAudience(value)
    if (isLast) finish()
    else goNext()
  }
  const finishAndSignIn = () => {
    markComplete()
    setShowAuth(true)
  }

  return (
    <>
      <Dialog open={open}>
        <DialogContent
          showCloseButton={false}
          className="max-w-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {step === 'welcome' && (
            <>
              <DialogHeader>
                <DialogTitle>{ob.welcomeTitle}</DialogTitle>
                <DialogDescription>{ob.welcomeBody}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Lock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  {ob.privacyTitle}
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {ob.privacyPoints.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden>•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {step === 'audience' && (
            <>
              <DialogHeader>
                <DialogTitle>{t.audience.onboarding.title}</DialogTitle>
                <DialogDescription>{t.audience.onboarding.description}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => chooseAudience('medical')}
                  className="group flex flex-col items-start gap-3 rounded-lg border-2 border-border p-5 text-left transition-colors hover:border-primary hover:bg-accent focus:border-primary focus:outline-none"
                >
                  <Stethoscope className="h-8 w-8 text-blue-600 group-hover:text-primary dark:text-blue-400" />
                  <div className="space-y-1">
                    <div className="font-semibold">{t.audience.onboarding.medicalCardTitle}</div>
                    <div className="text-sm text-muted-foreground">{t.audience.onboarding.medicalCardDescription}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => chooseAudience('patient')}
                  className="group flex flex-col items-start gap-3 rounded-lg border-2 border-border p-5 text-left transition-colors hover:border-primary hover:bg-accent focus:border-primary focus:outline-none"
                >
                  <User className="h-8 w-8 text-purple-600 group-hover:text-primary dark:text-purple-400" />
                  <div className="space-y-1">
                    <div className="font-semibold">{t.audience.onboarding.patientCardTitle}</div>
                    <div className="text-sm text-muted-foreground">{t.audience.onboarding.patientCardDescription}</div>
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'signIn' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <LogIn className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  {ob.signInTitle}
                </DialogTitle>
                <DialogDescription>{ob.signInBody}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="mb-1 flex items-center gap-1.5 font-medium">
                  <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-300" />
                  {ob.signInBenefitsTitle}
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  {ob.signInBenefits.map((b, i) => (
                    <li key={i}>• {b}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">{ob.guestHint}</p>
            </>
          )}

          {/* Footer — per-step controls + progress */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="text-xs text-muted-foreground">
              {ob.step} {safeStepIndex + 1} / {steps.length}
            </span>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <Button variant="ghost" size="sm" onClick={goBack}>
                  {ob.back}
                </Button>
              )}
              {step === 'welcome' && (
                <Button size="sm" onClick={goNext}>
                  {ob.start}
                </Button>
              )}
              {step === 'signIn' && (
                <>
                  <Button variant="outline" size="sm" onClick={finish}>
                    {ob.guestCta}
                  </Button>
                  <Button size="sm" onClick={finishAndSignIn}>
                    {ob.signInCta}
                  </Button>
                </>
              )}
              {/* 'audience' step advances via the cards — no footer primary. */}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {authDialog}
    </>
  )
}
