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
import { useBackDismissibleLayer } from "@/src/shared/hooks/layout/use-back-dismissible-layer.hook"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useResourceNavigationStore } from "@/src/application/stores/resource-navigation.store"
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type UIEvent } from "react"
import { ChevronUp, ChevronDown } from "lucide-react"
import { AiDemographicsGateProvider } from "@/src/application/providers/ai-demographics-gate.provider"
import { AiDemographicsGateDialog } from "@/features/medical-summary/components/AiDemographicsGateDialog"
import { LeftBrowserTour, TourHelpButton, useLeftBrowserTourStore } from "@/features/left-browser-tour"
import { RightFeatureTour, useRightFeatureTourStore } from "@/features/right-feature-tour"
import { TourMenuItems } from "@/features/left-browser-tour/TourMenuItems"
import { isMedcloudLaunchRoute } from "@/src/application/launch/medcloud-launch-route"
import { applyPilotPackIdsFromUrl } from "@/features/clinical-decision-support/guideline-packs/pilot-gate"
import { useOnboarding } from "@/src/application/hooks/onboarding/use-onboarding.hook"
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

// Closing a right-side detail is a PageContent-only presentation change. Keep
// the two large workspaces from rendering again during that first paint; their
// own context/store updates still render them when their data actually changes.
const StableClinicalSummaryFeature = memo(ClinicalSummaryFeature)
const StableRightPanelFeature = memo(RightPanelFeature)

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
  const rightTourActive = useRightFeatureTourStore((state) => state.active)
  const tourLauncherOpen = useRightFeatureTourStore((state) => state.launcherOpen)
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
  const dataLoaded = !!patient && !patientLoading && !patientError
  // The Medcloud launch is an unattended hand-off: no onboarding, and no
  // guided-tour offer either. Without this it still popped up for anyone whose
  // browser had completed onboarding on an earlier visit.
  const tourEligible = dataLoaded
    && !anyTourActive
    && !tourLauncherOpen
    && onboardingReady
    && onboardingCompleted
    && !isMedcloudLaunchRoute()

  // Right-pane detail: a left-panel card can push its expanded detail here
  // instead of expanding downward (see RightDetailProvider). When set, the right
  // section shows the detail (✕ returns to the AI features). Cleared on patient
  // change so one patient's detail never lingers onto the next.
  const { detail, clearDetail } = useRightDetail()
  const [closingDetailSourceId, setClosingDetailSourceId] = useState<string | null>(null)
  const deferredDetailClearFrameRef = useRef<number | null>(null)
  const deferredDetailClearTimerRef = useRef<number | null>(null)
  const detailVisible = !!detail && detail.sourceId !== closingDetailSourceId
  const detailOverlayRef = useRef<HTMLDivElement | null>(null)
  const leftPanelRef = useRef<HTMLElement | null>(null)
  const detailOriginScrollRef = useRef<{
    sourceId: string
    viewport: HTMLElement
    scrollTop: number
    focusTarget: HTMLElement | null
    anchorRowId: string | null
    anchorOffsetTop: number | null
  } | null>(null)
  const detailOriginRestoreFrameRef = useRef<number | null>(null)
  // Which detail has already pulled the phone over to the 「功能」 panel.
  // Without it the reveal effect re-fires on every `isLargeScreen` flip, so
  // rotating a phone across the 768 breakpoint with a detail still open
  // yanks the reader out of whatever panel they had navigated back to.
  const lastRevealedDetailSourceIdRef = useRef<string | null>(null)
  const pendingDetailOriginRestoreRef = useRef<string | null>(null)

  const captureDetailOrigin = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (isLargeScreen) return
    const eventTarget = event.target instanceof Element ? event.target : null
    const action = eventTarget?.closest<HTMLElement>('[data-detail-source-id]')
    const sourceId = action?.dataset.detailSourceId
    if (!action || !sourceId) return

    // Capture synchronously in the originating click. Waiting for the detail
    // state effect is too late on iOS: the left panel may already be hidden
    // and its scroll position clamped before that effect reads the viewport.
    const viewport = action.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) return
    const anchorRow = action.closest<HTMLElement>('[data-row-id]')
    detailOriginScrollRef.current = {
      sourceId,
      viewport,
      scrollTop: viewport.scrollTop,
      focusTarget: action,
      anchorRowId: anchorRow?.dataset.rowId ?? null,
      anchorOffsetTop: anchorRow
        ? anchorRow.getBoundingClientRect().top - viewport.getBoundingClientRect().top
        : null,
    }
  }, [isLargeScreen])

  // A detail action originates in the clinical-summary panel. In the phone
  // layout the shared detail pane lives behind the separate 「功能」 switcher,
  // so merely updating the detail slot looks like a dead button. Reveal that
  // panel for every newly requested detail; desktop keeps its split view.
  useEffect(() => {
    if (!detail) {
      lastRevealedDetailSourceIdRef.current = null
      return
    }
    if (isLargeScreen) return
    if (lastRevealedDetailSourceIdRef.current === detail.sourceId) return
    lastRevealedDetailSourceIdRef.current = detail.sourceId
    const alreadyCaptured = detailOriginScrollRef.current?.sourceId === detail.sourceId
    const viewport = alreadyCaptured
      ? null
      : leftPanelRef.current?.querySelector<HTMLElement>(
          '[role="tabpanel"][data-state="active"] [data-slot="scroll-area-viewport"]',
        )
    if (!alreadyCaptured && viewport) {
      const focusTarget = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      const anchorRow = focusTarget?.closest<HTMLElement>('[data-row-id]') ?? null
      detailOriginScrollRef.current = {
        sourceId: detail.sourceId,
        viewport,
        scrollTop: viewport.scrollTop,
        focusTarget,
        anchorRowId: anchorRow?.dataset.rowId ?? null,
        anchorOffsetTop: anchorRow
          ? anchorRow.getBoundingClientRect().top - viewport.getBoundingClientRect().top
          : null,
      }
    }
    setMobileView('right')
  }, [detail, isLargeScreen, setMobileView])

  useLayoutEffect(() => {
    const sourceId = pendingDetailOriginRestoreRef.current
    if (isLargeScreen || mobileView !== 'left' || !sourceId) return
    const origin = detailOriginScrollRef.current
    if (!origin || origin.sourceId !== sourceId) {
      pendingDetailOriginRestoreRef.current = null
      return
    }

    if (detailOriginRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(detailOriginRestoreFrameRef.current)
    }

    // The panel is visible again at this point. TanStack Virtual can publish
    // several corrected measurements while rebuilding its visible window, so
    // keep the exact scroll position and source row anchored during that short
    // settling period. An explicit scroll event removes the old requirement
    // for the clinician to nudge the page before the correct rows appear.
    let framesLeft = 30
    let focusRestored = false
    const restoreOrigin = () => {
      origin.viewport.scrollTop = origin.scrollTop
      origin.viewport.dispatchEvent(new Event('scroll'))

      const anchorRow = origin.anchorRowId
        ? Array.from(origin.viewport.querySelectorAll<HTMLElement>('[data-row-id]'))
            .find((row) => row.dataset.rowId === origin.anchorRowId) ?? null
        : null
      if (anchorRow && origin.anchorOffsetTop !== null) {
        const currentOffset = anchorRow.getBoundingClientRect().top
          - origin.viewport.getBoundingClientRect().top
        const correction = currentOffset - origin.anchorOffsetTop
        if (Number.isFinite(correction) && Math.abs(correction) > 0.5) {
          origin.viewport.scrollTop += correction
          origin.viewport.dispatchEvent(new Event('scroll'))
        }
      }

      const focusTarget = origin.focusTarget?.isConnected
        ? origin.focusTarget
        : origin.viewport.querySelector<HTMLElement>(
            `[data-detail-source-id="${CSS.escape(sourceId)}"]`,
          )
      if (!focusRestored && focusTarget) {
        focusTarget.focus({ preventScroll: true })
        focusRestored = true
      }

      framesLeft -= 1
      if (framesLeft > 0) {
        detailOriginRestoreFrameRef.current = window.requestAnimationFrame(restoreOrigin)
      } else {
        detailOriginRestoreFrameRef.current = null
        pendingDetailOriginRestoreRef.current = null
      }
    }
    restoreOrigin()

    return () => {
      if (detailOriginRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(detailOriginRestoreFrameRef.current)
        detailOriginRestoreFrameRef.current = null
      }
    }
  }, [isLargeScreen, mobileView])

  const cancelDeferredDetailClear = useCallback(() => {
    if (deferredDetailClearFrameRef.current !== null) {
      window.cancelAnimationFrame(deferredDetailClearFrameRef.current)
      deferredDetailClearFrameRef.current = null
    }
    if (deferredDetailClearTimerRef.current !== null) {
      window.clearTimeout(deferredDetailClearTimerRef.current)
      deferredDetailClearTimerRef.current = null
    }
  }, [])

  const closeDetailAfterPaint = useCallback(() => {
    if (!detail) return
    const sourceId = detail.sourceId
    cancelDeferredDetailClear()

    // On phones the detail temporarily switches from the clinical browser to
    // the separate 「功能」 panel. Closing is a back action, so return to the
    // originating clinical panel immediately; the active left sub-tab and its
    // scroll position stay mounted and therefore resume exactly where the
    // clinician opened the detail.
    if (!isLargeScreen) {
      pendingDetailOriginRestoreRef.current = sourceId
      setMobileView('left')
    }

    // First paint: reveal the already-mounted feature panel and hide the trend.
    // The expensive chart/table cleanup runs only after the browser has shown
    // that response, so the button itself feels immediate.
    setClosingDetailSourceId(sourceId)
    deferredDetailClearFrameRef.current = window.requestAnimationFrame(() => {
      deferredDetailClearFrameRef.current = null
      deferredDetailClearTimerRef.current = window.setTimeout(() => {
        deferredDetailClearTimerRef.current = null
        clearDetail(sourceId)
        setClosingDetailSourceId(null)
      }, 0)
    })
  }, [cancelDeferredDetailClear, clearDetail, detail, isLargeScreen, setMobileView])

  // Android's hardware back and iOS' edge swipe are how phone readers close
  // the top layer. Both used to leave the app outright, taking the loaded
  // bundle and every AI result with them. Treat "the phone is showing
  // something other than the clinical browser" as one dismissible layer:
  // back closes the detail if one is open, otherwise returns to 臨床摘要.
  const phoneLayerOpen = !isLargeScreen && (detailVisible || mobileView === 'right')
  const dismissPhoneLayer = useCallback(() => {
    if (detail) {
      closeDetailAfterPaint()
      return
    }
    setMobileView('left')
  }, [closeDetailAfterPaint, detail, setMobileView])
  useBackDismissibleLayer(phoneLayerOpen, dismissPhoneLayer)

  useEffect(() => () => {
    cancelDeferredDetailClear()
    if (detailOriginRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(detailOriginRestoreFrameRef.current)
    }
  }, [cancelDeferredDetailClear])

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
    if (detailVisible) return
    featureScrollTopRef.current = event.currentTarget.scrollTop
  }, [detailVisible])

  useLayoutEffect(() => {
    if (!detailVisible) return
    const panel = rightPanelRef.current
    const overlay = detailOverlayRef.current
    if (!panel || !overlay) return
    // The panel keeps its feature scroll position while the absolute detail
    // layer is open. Align that layer with the currently visible scrollport
    // before paint instead of forcing the underlying workspace back to zero.
    overlay.style.top = `${panel.scrollTop}px`
  }, [detail?.sourceId, detailVisible])

  useLayoutEffect(() => {
    const panel = rightPanelRef.current
    const hasDetail = detailVisible
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
  }, [detailVisible])

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
              tourMenu={<TourMenuItems disabled={!dataLoaded} />}
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
          ref={leftPanelRef}
          onClickCapture={captureDetailOrigin}
          aria-label={t.header.clinicalSummary}
          mobileActive={mobileView === 'left'}
          preserveMobileLayoutWhenInactive={!isLargeScreen && detailVisible}
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
            <StableClinicalSummaryFeature />
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
            showCollapseActions={!detailVisible}
          />
        )}

        {/* Right Panel - Tabs (Medical Note / Data Selection) */}
        <ClinicalWorkspacePanel
          ref={rightPanelRef}
          onScroll={handleRightPanelScroll}
          aria-label={t.header.features}
          className={detailVisible ? "relative overflow-y-hidden" : "relative"}
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
            {/* Keep the feature panel laid out underneath the detail overlay.
                Removing it from layout made every close synchronously rebuild
                this large clinical workspace on slower devices. `inert` and
                aria-hidden keep the covered controls out of pointer, keyboard,
                and assistive-technology navigation without discarding their
                layout, in-flight AI stream, or local input state. */}
            <div
              className="contents"
              aria-hidden={detailVisible}
              inert={detailVisible || undefined}
            >
              <StableRightPanelFeature />
            </div>
            {detail && (
              <div
                ref={detailOverlayRef}
                className={detailVisible
                  ? 'absolute inset-x-0 z-30 h-full bg-panel'
                  : 'hidden'}
              >
                <RightDetailPane title={detail.title} onClose={closeDetailAfterPaint}>
                  {detail.node}
                </RightDetailPane>
              </div>
            )}
          </ErrorBoundary>
        </ClinicalWorkspacePanel>

        {/* Detail-mode rail (向右展開): the detail occupies the right column in
            place of the AI 功能 panel, so the collapse control sits here at the
            far right — clicking it brings the 功能 panel back (same as closing
            the detail). Only when not already collapsed. */}
        {detailVisible && collapsed === null && (
          <ClinicalWorkspaceRail
            onClick={closeDetailAfterPaint}
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
  // Pilot packs are a URL switch, read once at app start in the same spirit as
  // the SMART launch params: `?pilotPacks=heart-failure-cdss` shows this browser
  // a pack the package ships disabled, `?pilotPacks=` clears it, and the
  // Medcloud launch route honours neither (the gate itself refuses there).
  // Read during this first render rather than from an effect, so the pack
  // registry already answers correctly the first time a feature asks it.
  useState(() => {
    if (typeof window !== 'undefined') applyPilotPackIdsFromUrl(window.location.search)
    return null
  })

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
