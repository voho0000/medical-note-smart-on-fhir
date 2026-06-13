// app/page.tsx
"use client"

import { AppProviders } from "@/src/application/providers/app-providers"
import { useLanguage } from "@/src/application/providers/language.provider"
import { LanguageSwitcher } from "@/src/shared/components/LanguageSwitcher"
import { AudienceSwitcher } from "@/src/shared/components/AudienceSwitcher"
import { AudienceOnboardingDialog } from "@/src/shared/components/AudienceOnboardingDialog"
import { HeaderOverflowMenu } from "@/src/shared/components/HeaderOverflowMenu"
import { ImportBundleButton } from "@/features/import-bundle/ImportBundleButton"
import { HeaderAuthButton } from "@/features/auth"
import { EmailVerificationBanner } from "@/features/auth/components/EmailVerificationBanner"
import { WelcomeOnboarding } from "./_components/WelcomeOnboarding"
import { ErrorBoundary } from "@/src/shared/components/ErrorBoundary"
import ClinicalSummaryFeature from "@/src/layouts/LeftPanelLayout"
import { RightPanelFeature } from "@/src/layouts/RightPanelLayout"
import { useResizableLayout } from "@/src/shared/hooks/layout/use-resizable-layout.hook"
import { useResponsiveView } from "@/src/shared/hooks/layout/use-responsive-view.hook"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useState } from "react"
import { cn } from "@/src/shared/utils/cn.utils"
import { ChevronsLeft, ChevronsRight } from "lucide-react"

function PageContent() {
  const { t } = useLanguage()

  // Resizable layout logic (extracted to custom hook)
  const { leftWidth, containerRef, handleMouseDown } = useResizableLayout({
    initialWidth: 50,
    minWidth: 30,
    maxWidth: 70
  })

  // Responsive view logic (extracted to custom hook)
  const { mobileView, setMobileView, isLargeScreen } = useResponsiveView<'left' | 'right'>('left', 1024)

  // Panel collapse (lg only): collapse either side to give the other full width.
  // null = normal resizable split. Kept in-session (not persisted) to avoid the
  // SSR/localStorage hydration mismatch class of bugs.
  const [collapsed, setCollapsed] = useState<'left' | 'right' | null>(null)

  // Onboarding detection: when neither SMART nor a local bundle is available,
  // the data hooks return `patient: null` with no error. Show a welcome
  // screen instead of empty / failing panels.
  const { patient, loading: patientLoading, error: patientError } = usePatient()
  const showOnboarding = !patientLoading && !patient && !patientError
  
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-gradient-to-br from-blue-50/50 via-background to-purple-50/30">
      <header className="shrink-0 border-b bg-white/80 backdrop-blur-md px-3 py-3 sm:px-6 sm:py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl overflow-hidden">
              <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/icon.svg`} alt="App Icon" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-base sm:text-xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{t.header.title}</h1>
          </div>
          {/* Header right cluster — kept lean (v0.4.0).
              Less-used controls (theme, version, feedback, connection
              info) live inside HeaderOverflowMenu (kebab); audience +
              language collapse into the same menu only on mobile so the
              bar never wraps on narrow screens. */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* iconOnlyOnMobile: header is space-constrained, so the
                "匯入資料" label collapses on phones. The Welcome screen
                mounts the same component without this flag so its big
                CTA always reads as a labeled button. */}
            <ImportBundleButton iconOnlyOnMobile />
            <div className="hidden sm:flex items-center gap-2 sm:gap-3">
              <AudienceSwitcher />
              <LanguageSwitcher />
            </div>
            <HeaderAuthButton />
            <HeaderOverflowMenu />
          </div>
        </div>
      </header>
      
      {/* Email Verification Banner */}
      <div className="px-3 sm:px-6">
        <EmailVerificationBanner />
      </div>
      
      {/* Onboarding state: replace panels with welcome screen */}
      {showOnboarding ? (
        <main className="flex flex-1 overflow-auto">
          <WelcomeOnboarding />
        </main>
      ) : (
      <>
      {/* Mobile Tab Switcher - Only visible on small screens */}
      <div className="lg:hidden flex border-b bg-white/80 backdrop-blur-md">
        <button
          onClick={() => setMobileView('left')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mobileView === 'left'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {t.header.clinicalSummary || '臨床摘要'}
        </button>
        <button
          onClick={() => setMobileView('right')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mobileView === 'right'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {t.header.features || '功能'}
        </button>
      </div>

      <main className="flex flex-1 flex-col lg:flex-row gap-3 sm:gap-6 overflow-hidden p-3 sm:p-6" ref={containerRef}>
        {/* Left collapsed rail (lg only) — the WHOLE strip is clickable to expand */}
        {collapsed === 'left' && (
          <button
            type="button"
            onClick={() => setCollapsed(null)}
            title={`展開 ${t.header.clinicalSummary || '臨床摘要'}`}
            aria-label={`展開 ${t.header.clinicalSummary || '臨床摘要'}`}
            className="group hidden lg:flex w-8 shrink-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border bg-card/70 text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
          >
            <ChevronsRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            <span className="select-none text-xs font-medium [writing-mode:vertical-rl]">
              {t.header.clinicalSummary || '臨床摘要'}
            </span>
          </button>
        )}

        {/* Left Panel - Clinical Summary */}
        <section
          className={cn(
            "w-full lg:w-auto min-h-0 overflow-y-auto flex-1",
            mobileView === 'left' ? 'block' : 'hidden',
            collapsed === 'left'
              ? 'lg:hidden'
              : collapsed === 'right'
                ? 'lg:block lg:flex-1'
                : 'lg:block lg:flex-initial',
          )}
          style={isLargeScreen && collapsed === null ? { width: `${leftWidth}%` } : undefined}
        >
          {/* Per-panel boundary: a render crash in one panel must not white-screen the other */}
          <ErrorBoundary>
            <ClinicalSummaryFeature />
          </ErrorBoundary>
        </section>

        {/* Resizable Divider with always-visible collapse controls. Hidden on mobile. */}
        {collapsed === null && (
          <div className="hidden lg:flex group relative w-2 shrink-0 items-center justify-center">
            {/* Full-height drag hit-area (extends past the visible bar) */}
            <div
              className="absolute inset-y-0 -left-2 -right-2 cursor-col-resize rounded-full bg-border/60 transition-colors group-hover:bg-primary/20 active:bg-primary/30"
              onMouseDown={handleMouseDown}
            />
            {/* Collapse buttons — always visible, centered on the divider */}
            <div className="absolute z-10 flex flex-col gap-1">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setCollapsed('left')}
                title="收合左欄"
                aria-label="收合左欄"
                className="rounded-md border bg-card p-0.5 text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setCollapsed('right')}
                title="收合右欄"
                aria-label="收合右欄"
                className="rounded-md border bg-card p-0.5 text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Right Panel - Tabs (Medical Note / Data Selection) */}
        <section
          className={cn(
            "w-full lg:w-auto min-h-0 overflow-y-auto flex-1",
            mobileView === 'right' ? 'block' : 'hidden',
            collapsed === 'right'
              ? 'lg:hidden'
              : collapsed === 'left'
                ? 'lg:block lg:flex-1'
                : 'lg:block lg:flex-initial',
          )}
          style={isLargeScreen && collapsed === null ? { width: `${100 - leftWidth - 0.5}%` } : undefined}
        >
          <ErrorBoundary>
            <RightPanelFeature />
          </ErrorBoundary>
        </section>

        {/* Right collapsed rail (lg only) — the WHOLE strip is clickable to expand */}
        {collapsed === 'right' && (
          <button
            type="button"
            onClick={() => setCollapsed(null)}
            title={`展開 ${t.header.features || '功能'}`}
            aria-label={`展開 ${t.header.features || '功能'}`}
            className="group hidden lg:flex w-8 shrink-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border bg-card/70 text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
          >
            <ChevronsLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="select-none text-xs font-medium [writing-mode:vertical-rl]">
              {t.header.features || '功能'}
            </span>
          </button>
        )}
      </main>
      </>
      )}

      <AudienceOnboardingDialog />
    </div>
  )
}

export default function Page() {
  return (
    <AppProviders>
      <ErrorBoundary>
        <PageContent />
      </ErrorBoundary>
    </AppProviders>
  )
}
