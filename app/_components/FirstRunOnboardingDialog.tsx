// First-run onboarding — a short stepper shown the first time clinical data is
// loaded (SMART launch / local bundle / demo all converge on `patient` becoming
// non-null). Replaces the old audience-only dialog: it bundles the audience
// choice with the auto-safety-insights opt-in and a sign-in / guest step.
//
// Step list is built dynamically and frozen when the flow opens:
//   • welcome + audience  — only for brand-new users (no audience chosen yet)
//   • autoScan            — always (the main new question)
//   • signIn              — only when not signed in
// So returning users who already picked an audience just get the new question(s)
// once, gated on the versioned `medical-note-onboarding-v1` flag.
"use client"

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Stethoscope, User, ShieldCheck, Sparkles, LogIn, Lock } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useSafetyPrefsStore } from '@/src/application/hooks/safety-alerts/use-safety-alerts.hook'
import { useOnboarding } from '@/src/application/hooks/onboarding/use-onboarding.hook'
import { AuthDialog } from '@/features/auth/components/AuthDialog'

type StepId = 'welcome' | 'audience' | 'autoScan' | 'signIn'

export function FirstRunOnboardingDialog() {
  const { t } = useLanguage()
  const ob = t.onboarding
  const { patient, loading: patientLoading, error: patientError } = usePatient()
  const { completed, markComplete } = useOnboarding()
  const { setAudience, hasSelected } = useAudience()
  const { user } = useAuth()
  const autoScan = useSafetyPrefsStore((s) => s.autoScan)
  const setAutoScan = useSafetyPrefsStore((s) => s.setAutoScan)

  const dataLoaded = !!patient && !patientLoading && !patientError
  const open = dataLoaded && !completed

  const [steps, setSteps] = useState<StepId[] | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [showAuth, setShowAuth] = useState(false)

  // Freeze the step list when the flow first opens — selecting an audience mid-
  // flow flips `hasSelected`, which would otherwise shrink the array and break
  // the index.
  useEffect(() => {
    if (open && steps === null) {
      const s: StepId[] = []
      if (!hasSelected) s.push('welcome', 'audience')
      s.push('autoScan')
      if (!user) s.push('signIn')
      setSteps(s)
      setStepIndex(0)
    }
  }, [open, steps, hasSelected, user])

  // AuthDialog is always rendered so a 登入 choice (which closes this flow first)
  // can still surface it afterwards.
  const authDialog = <AuthDialog open={showAuth} onOpenChange={setShowAuth} />

  if (!open || !steps || steps.length === 0) return authDialog

  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1
  const goNext = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0))
  const finish = () => markComplete()
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
                  <Lock className="h-4 w-4 text-emerald-600" />
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
                  onClick={() => {
                    setAudience('medical')
                    goNext()
                  }}
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
                  onClick={() => {
                    setAudience('patient')
                    goNext()
                  }}
                  className="group flex flex-col items-start gap-3 rounded-lg border-2 border-border p-5 text-left transition-colors hover:border-primary hover:bg-accent focus:border-primary focus:outline-none"
                >
                  <User className="h-8 w-8 text-purple-600 group-hover:text-primary" />
                  <div className="space-y-1">
                    <div className="font-semibold">{t.audience.onboarding.patientCardTitle}</div>
                    <div className="text-sm text-muted-foreground">{t.audience.onboarding.patientCardDescription}</div>
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'autoScan' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-600" />
                  {ob.autoScanTitle}
                </DialogTitle>
                <DialogDescription>{ob.autoScanBody}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 pt-1 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAutoScan(true)}
                  aria-pressed={autoScan}
                  className={`flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors focus:outline-none ${
                    autoScan ? 'border-primary bg-accent' : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  }`}
                >
                  <div className="font-semibold">{ob.autoScanOnLabel}</div>
                  <div className="text-sm text-muted-foreground">{ob.autoScanOnDesc}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoScan(false)}
                  aria-pressed={!autoScan}
                  className={`flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors focus:outline-none ${
                    !autoScan ? 'border-primary bg-accent' : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  }`}
                >
                  <div className="font-semibold">{ob.autoScanOffLabel}</div>
                  <div className="text-sm text-muted-foreground">{ob.autoScanOffDesc}</div>
                </button>
              </div>
            </>
          )}

          {step === 'signIn' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <LogIn className="h-5 w-5 text-blue-600" />
                  {ob.signInTitle}
                </DialogTitle>
                <DialogDescription>{ob.signInBody}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="mb-1 flex items-center gap-1.5 font-medium">
                  <Sparkles className="h-4 w-4 text-amber-500" />
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
              {ob.step} {stepIndex + 1} / {steps.length}
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
              {step === 'autoScan' && (
                <Button size="sm" onClick={isLast ? finish : goNext}>
                  {isLast ? ob.finish : ob.next}
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
