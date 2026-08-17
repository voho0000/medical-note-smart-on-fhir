// app/page.tsx
"use client"

import { AppProviders } from "@/src/application/providers/app-providers"
import { useLanguage } from "@/src/application/providers/language.provider"
import { LanguageSwitcher } from "@/src/shared/components/LanguageSwitcher"
import { AudienceSwitcher } from "@/src/shared/components/AudienceSwitcher"
import { FirstRunOnboardingDialog } from "./_components/FirstRunOnboardingDialog"
import { HeaderOverflowMenu } from "@/src/shared/components/HeaderOverflowMenu"
import { ImportBundleButton } from "@/features/import-bundle/ImportBundleButton"
import { HeaderAuthButton } from "@/features/auth"
import { EmailVerificationBanner } from "@/features/auth/components/EmailVerificationBanner"
import { WelcomeOnboarding } from "./_components/WelcomeOnboarding"
import { RightDetailPane } from "./_components/RightDetailPane"
import { RightDetailProvider, useRightDetail } from "@/src/application/providers/right-detail.provider"
import { ErrorBoundary } from "@/src/shared/components/ErrorBoundary"
import ClinicalSummaryFeature from "@/src/layouts/LeftPanelLayout"
import { RightPanelFeature } from "@/src/layouts/RightPanelLayout"
import { useResizableLayout } from "@/src/shared/hooks/layout/use-resizable-layout.hook"
import { useResponsiveView } from "@/src/shared/hooks/layout/use-responsive-view.hook"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useResourceNavigationStore } from "@/src/application/stores/resource-navigation.store"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react"
import { ChevronUp, ChevronDown } from "lucide-react"
import { AiDemographicsGateProvider } from "@/src/application/providers/ai-demographics-gate.provider"
import { AiDemographicsGateDialog } from "@/features/medical-summary/components/AiDemographicsGateDialog"
import { LeftBrowserTour, TourHelpButton, useLeftBrowserTourStore } from "@/features/left-browser-tour"
import { RightFeatureTour, useRightFeatureTourStore } from "@/features/right-feature-tour"
import { useOnboarding } from "@/src/application/hooks/onboarding/use-onboarding.hook"
import { useAutoAiConsentState } from "@/src/application/hooks/ai-generation/auto-ai-consent"
import { NetworkStatusBanner } from "@/src/shared/components/NetworkStatusBanner"
import {
  ClinicalMobilePanelSwitcher,
  ClinicalPatientContext,
  ClinicalWorkspaceDivider,
  ClinicalWorkspaceMain,
  ClinicalWorkspacePanel,
  ClinicalWorkspaceRail,
  ClinicalWorkspaceRoot,
} from "@/src/shared/components/clinical-workspace"

function PageContent() {
  const { t } = useLanguage()

  // Resizable layout logic (extracted to custom hook)
  const { leftWidth, containerRef, handleMouseDown } = useResizableLayout({
    initialWidth: 50,
    minWidth: 30,
    maxWidth: 70
  })

  // Responsive view logic (extracted to custom hook)
  // Two-panel split kicks in at 768px (md) so iPad-portrait tablets get the
  // resizable + collapsible split instead of the phone single-column tab view.
  // Below 768 = phone tab switcher. Keep this in sync with the md: classes below.
  const { mobileView, setMobileView, isLargeScreen } = useResponsiveView<'left' | 'right'>('left', 768)

  const navPending = useResourceNavigationStore((s) => s.pending)
  const navSeq = useResourceNavigationStore((s) => s.seq)

  // Panel collapse (lg only): collapse either side to give the other full width.
  // null = normal resizable split. Kept in-session (not persisted) to avoid the
  // SSR/localStorage hydration mismatch class of bugs.
  const [collapsed, setCollapsed] = useState<'left' | 'right' | null>(null)
  const leftTourActive = useLeftBrowserTourStore((state) => state.active)
  const startLeftTour = useLeftBrowserTourStore((state) => state.start)
  const rightTourActive = useRightFeatureTourStore((state) => state.active)
  const startRightTour = useRightFeatureTourStore((state) => state.start)
  const anyTourActive = leftTourActive || rightTourActive
  const tourWasActiveRef = useRef(false)
  const preTourLayoutRef = useRef<{
    mobileView: 'left' | 'right'
    collapsed: 'left' | 'right' | null
  } | null>(null)

  // Guided tours make their corresponding panel visible, then return the
  // user's mobile/collapsed layout when the tour is closed or completed.
  useEffect(() => {
    if (anyTourActive) {
      if (!tourWasActiveRef.current) {
        tourWasActiveRef.current = true
        preTourLayoutRef.current = { mobileView, collapsed }
      }
      setMobileView(rightTourActive ? 'right' : 'left')
      // Tour state is an external store event; revealing its panel is the
      // synchronization this effect owns.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(null)
      return
    }
    if (tourWasActiveRef.current) {
      tourWasActiveRef.current = false
      const previous = preTourLayoutRef.current
      preTourLayoutRef.current = null
      if (previous) {
        setMobileView(previous.mobileView)
        setCollapsed(previous.collapsed)
      }
    }
  }, [anyTourActive, collapsed, mobileView, rightTourActive, setMobileView])

  // Resource navigation (cited source clicked in the Medical Summary tab): the
  // target lives in the LEFT panel, so make sure it's visible BEFORE its
  // tab/anchor react to the same request — flip the phone single-column view to
  // 臨床摘要, and on desktop un-collapse the left panel if it was hidden (the
  // anchor can't scroll into a display:none column).
  useEffect(() => {
    if (!navPending) return
    setMobileView('left')
    // Resource-navigation requests come from an external store and must make
    // the target panel visible before anchor scrolling runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed((c) => (c === 'left' ? null : c))
  }, [navPending, navSeq, setMobileView])

  // Header collapse: tuck the title/toolbar away into a slim strip so the
  // panels get the full viewport height. In-session only (same hydration
  // reasoning as `collapsed`). The less-used header controls (匯入資料 /
  // 語言 / 身份 …) come back with one click on the strip.
  const [headerCollapsed, setHeaderCollapsed] = useState(false)

  // Onboarding detection: when neither SMART nor a local bundle is available,
  // the data hooks return `patient: null` with no error. Show a welcome
  // screen instead of empty / failing panels.
  const { patient, loading: patientLoading, error: patientError } = usePatient()
  const showOnboarding = !patientLoading && !patient && !patientError
  const { ready: onboardingReady, completed: onboardingCompleted } = useOnboarding()
  const autoAiConsent = useAutoAiConsentState()
  const dataLoaded = !!patient && !patientLoading && !patientError
  const consentResolved = autoAiConsent.source === 'demo'
    || autoAiConsent.decision === 'auto'
    || autoAiConsent.decision === 'manual'
  const tourEligible = dataLoaded && onboardingReady && onboardingCompleted && consentResolved

  // Right-pane detail: a left-panel card can push its expanded detail here
  // instead of expanding downward (see RightDetailProvider). When set, the right
  // section shows the detail (✕ returns to the AI features). Cleared on patient
  // change so one patient's detail never lingers onto the next.
  const { detail, clearDetail } = useRightDetail()
  useEffect(() => {
    if (!detail || !isLargeScreen) return
    const timer = window.setTimeout(() => {
      setCollapsed((current) => (current === 'right' ? null : current))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [detail, isLargeScreen])
  useEffect(() => {
    clearDetail()
  }, [patient?.id, clearDetail])
  useEffect(() => {
    if (rightTourActive) clearDetail()
  }, [clearDetail, rightTourActive])

  // The feature panel stays mounted behind the detail, but hiding it collapses
  // this section's scrollHeight, which clamps scrollTop to 0. Remember where
  // the clinician was reading and put them back when the detail closes —
  // otherwise every trend peek costs them their place in a long summary.
  const rightPanelRef = useRef<HTMLElement | null>(null)
  const featureScrollTopRef = useRef(0)
  const hadDetailRef = useRef(false)
  // Track the reading position continuously rather than reading it when the
  // detail opens: by the time any effect runs, React has already hidden the
  // feature panel, the section's scrollHeight has collapsed and the browser
  // has clamped scrollTop to 0 — so the position is gone before we could
  // sample it.
  const handleRightPanelScroll = useCallback((event: UIEvent<HTMLElement>) => {
    if (detail) return
    featureScrollTopRef.current = event.currentTarget.scrollTop
  }, [detail])

  useLayoutEffect(() => {
    const panel = rightPanelRef.current
    const hasDetail = !!detail
    const hadDetail = hadDetailRef.current
    hadDetailRef.current = hasDetail
    if (!panel) return
    if (hasDetail || !hadDetail) return

    // Coming back from the detail. The panel's cards re-lay out over the next
    // few frames (several mount deferred), so a single assignment lands while
    // the panel is still short and gets clamped back to 0. Re-apply until it
    // sticks, with a hard frame budget so this can never spin.
    const target = featureScrollTopRef.current
    if (target <= 0) return
    let framesLeft = 30
    let frame = 0
    const restore = () => {
      panel.scrollTop = target
      framesLeft -= 1
      if (Math.abs(panel.scrollTop - target) > 1 && framesLeft > 0) {
        frame = requestAnimationFrame(restore)
      }
    }
    restore()
    return () => cancelAnimationFrame(frame)
  }, [detail])

  return (
    <ClinicalWorkspaceRoot>
      {headerCollapsed ? (
        // Slim strip — reclaims the full header height for the panels. The
        // whole strip is the expand affordance; the app icon + chevron make it
        // read as a clickable control rather than a stray divider.
        <button
          type="button"
          onClick={() => setHeaderCollapsed(false)}
          aria-expanded={false}
          aria-label={t.header.expandHeader}
          title={t.header.expandHeader}
          className="group flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 border-b bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:min-h-8"
        >
          <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/icon.svg?v=3`} alt="" className="h-4 w-4 object-contain opacity-70" />
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
        </button>
      ) : (
      <header className="@container relative shrink-0 border-b border-border bg-card px-3 py-1.5 sm:px-4">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden max-[359px]:hidden">
              <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/icon.svg?v=3`} alt="App Icon" className="h-full w-full object-contain" />
            </div>
            <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
              <span>MediPrisma</span>
              <span className="max-lg:hidden @max-[80rem]:hidden"> · SMART on FHIR</span>
            </h1>
          </div>
          <ClinicalPatientContext patient={patient} />
          {/* Header right cluster — kept lean (v0.4.0).
              Less-used controls (theme, version, feedback, connection
              info) live inside HeaderOverflowMenu (kebab); audience +
              language collapse into the same menu only on mobile so the
              bar never wraps on narrow screens. */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-3 @max-[72rem]:gap-1">
            {/* iconOnlyOnMobile: header is space-constrained, so the
                "匯入資料" label collapses on phones. The Welcome screen
                mounts the same component without this flag so its big
                CTA always reads as a labeled button. */}
            <ImportBundleButton iconOnlyOnMobile />
            <div className="flex items-center gap-2 max-lg:hidden lg:gap-3">
              <AudienceSwitcher />
              <LanguageSwitcher />
            </div>
            <TourHelpButton disabled={!dataLoaded} />
            <HeaderAuthButton />
            <HeaderOverflowMenu
              tourDisabled={!dataLoaded}
              onStartLeftTour={startLeftTour}
              onStartRightTour={startRightTour}
            />
          </div>
        </div>
        {/* Keep the collapse handle fully inside the header. Letting it
            straddle the bottom edge covered the compact desktop tab row. */}
        <button
          type="button"
          onClick={() => setHeaderCollapsed(true)}
          aria-label={t.header.collapseHeader}
          title={t.header.collapseHeader}
          className="absolute bottom-0 left-1/2 z-20 inline-flex h-6 w-8 -translate-x-1/2 items-center justify-center rounded-t-md border border-b-0 border-border bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary max-md:hidden"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
      </header>
      )}

      <ClinicalPatientContext patient={patient} variant="mobile" />
      
      {/* Email Verification Banner */}
      <div className="px-3 sm:px-6">
        <EmailVerificationBanner />
        <NetworkStatusBanner />
      </div>
      
      {/* Onboarding state: replace panels with welcome screen */}
      {showOnboarding ? (
        <main className="flex flex-1 overflow-auto">
          <WelcomeOnboarding />
        </main>
      ) : (
      <>
      <ClinicalMobilePanelSwitcher
        activePanel={mobileView}
        leftLabel={t.header.clinicalSummary}
        rightLabel={t.header.features}
        onChange={setMobileView}
      />

      <ClinicalWorkspaceMain ref={containerRef}>
        {/* Left collapsed rail (lg only) — the WHOLE strip is clickable to expand */}
        {collapsed === 'left' && (
          <ClinicalWorkspaceRail
            onClick={() => setCollapsed(null)}
            label={t.header.expandClinicalSummary}
            iconDirection="right"
          >
            {t.header.clinicalSummary}
          </ClinicalWorkspaceRail>
        )}

        {/* Left Panel - Clinical Summary */}
        <ClinicalWorkspacePanel
          aria-label={t.header.clinicalSummary}
          mobileActive={mobileView === 'left'}
          desktopState={
            collapsed === 'left'
              ? 'collapsed'
              : collapsed === 'right'
                ? 'fill'
                : 'split'
          }
          desktopWidth={
            isLargeScreen && collapsed === null ? `${leftWidth}%` : undefined
          }
        >
          {/* Per-panel boundary: a render crash in one panel must not white-screen the other */}
          <ErrorBoundary>
            <ClinicalSummaryFeature />
          </ErrorBoundary>
        </ClinicalWorkspacePanel>

        {/* Resizable Divider with always-visible collapse controls. Hidden on mobile. */}
        {collapsed === null && (
          <ClinicalWorkspaceDivider
            label={t.header.resizePanels}
            onDragStart={handleMouseDown}
            onCollapseLeft={() => setCollapsed('left')}
            onCollapseRight={() => setCollapsed('right')}
            leftCollapseLabel={t.header.collapseClinicalSummary}
            rightCollapseLabel={t.header.collapseFeatures}
            showCollapseActions={!detail}
          />
        )}

        {/* Right Panel - Tabs (Medical Note / Data Selection) */}
        <ClinicalWorkspacePanel
          ref={rightPanelRef}
          onScroll={handleRightPanelScroll}
          aria-label={t.header.features}
          mobileActive={mobileView === 'right'}
          desktopState={
            collapsed === 'right'
              ? 'collapsed'
              : collapsed === 'left'
                ? 'fill'
                : 'split'
          }
          desktopWidth={
            isLargeScreen && collapsed === null
              ? `${100 - leftWidth - 0.5}%`
              : undefined
          }
        >
          <ErrorBoundary>
            {/* The detail view (lab trend, report image…) takes over this
                column, but it must NOT unmount the feature panel: that aborts
                an in-flight AI stream mid-answer and throws away calculator
                inputs and IPS clinician confirmations. Hide it with CSS
                instead — same approach as the mobile panel switch. `contents`
                keeps the layout identical to rendering it directly. */}
            <div className={detail ? 'hidden' : 'contents'}>
              <RightPanelFeature />
            </div>
            {detail && (
              <RightDetailPane title={detail.title} onClose={clearDetail}>
                {detail.node}
              </RightDetailPane>
            )}
          </ErrorBoundary>
        </ClinicalWorkspacePanel>

        {/* Detail-mode rail (向右展開): the detail occupies the right column in
            place of the AI 功能 panel, so the collapse control sits here at the
            far right — clicking it brings the 功能 panel back (same as closing
            the detail). Only when not already collapsed. */}
        {detail && collapsed === null && (
          <ClinicalWorkspaceRail
            onClick={clearDetail}
            label={t.header.expandFeatures}
            iconDirection="left"
          >
            {t.header.features}
          </ClinicalWorkspaceRail>
        )}

        {/* Right collapsed rail (lg only) — the WHOLE strip is clickable to expand */}
        {collapsed === 'right' && (
          <ClinicalWorkspaceRail
            onClick={() => setCollapsed(null)}
            label={t.header.expandFeatures}
            iconDirection="left"
          >
            {t.header.features}
          </ClinicalWorkspaceRail>
        )}
      </ClinicalWorkspaceMain>
      </>
      )}

      <FirstRunOnboardingDialog />
      <LeftBrowserTour eligible={tourEligible} />
      <RightFeatureTour />
    </ClinicalWorkspaceRoot>
  )
}

export default function Page() {
  return (
    <AppProviders>
      <ErrorBoundary>
        <AiDemographicsGateProvider>
          <RightDetailProvider>
            <PageContent />
          </RightDetailProvider>
          <AiDemographicsGateDialog />
        </AiDemographicsGateProvider>
      </ErrorBoundary>
    </AppProviders>
  )
}
