// Medical Summary (醫療摘要) — one feature with two reading modes:
// structured standard summary and independently generated custom summaries.
// Structured AI output (Zod-validated) renders as fixed cards — never a
// free-text markdown blob. Pluggable via right-panel-registry (enabled flag).
"use client"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
import { ClipboardList, Database, LayoutList, Loader2, Settings2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { StreamingIndicator } from "@/src/shared/components/StreamingIndicator"
import { useMedicalSummaryOrchestrator } from "@/src/application/hooks/medical-summary/use-medical-summary-orchestrator.hook"
import {
  useResourceNavigationStore,
  NAV_CLAIM_TIMEOUT_MS,
  type ResourceNavTarget,
} from "@/src/application/stores/resource-navigation.store"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { ModelPicker } from "@/src/shared/components/ModelPicker"
import {
  MODEL_PREF_DEFAULTS,
  useModelPref,
  useSetModelFor,
} from "@/src/application/stores/model-prefs.store"
import { MEDICAL_SUMMARY_MODEL_ID } from "@/src/core/use-cases/medical-summary/generate-medical-summary.use-case"
import { CUSTOM_OPENAI_MODEL_ID } from "@/src/shared/constants/ai-models.constants"
import { formatApproxTokenCount, type ContextOverflowIssue } from "@/src/shared/utils/context-budget"
import { CurrentPrioritiesCard } from "./components/CurrentPrioritiesCard"
import { DecisionList } from "./components/DecisionList"
import { InvestigationTrendsCard } from "./components/InvestigationTrendsCard"
import { MedicationEducationCard } from "./components/MedicationEducationCard"
import { MedicationReconciliationCard } from "./components/MedicationReconciliationCard"
import { CareRemindersSafetyCard } from "./components/CareRemindersSafetyCard"
import { ProblemListCard } from "./components/ProblemListCard"
import { CrossFacilityTimeline } from "./components/CrossFacilityTimeline"
import { CoverageCard } from "./components/CoverageCard"
import { GenerationErrorBanner } from "./components/GenerationErrorBanner"
import {
  getSummaryGenerationActivityState,
  SummaryGenerationButton,
} from "./components/SummaryGenerationButton"
import { SourceSup } from "./components/SourceSup"
import { CustomInsightModulesSection } from "./components/CustomInsightModulesSection"
import { CustomInsightModulesManagerDrawer } from "./components/CustomInsightModulesManagerDrawer"
import { DataSelectionDrawer } from "@/features/data-selection"
import {
  MedicalSummaryCardLayoutManager,
  type MedicalSummaryCardLayoutItem,
} from "./components/MedicalSummaryCardLayoutManager"
import {
  useMedicalSummaryCardLayout,
  type MedicalSummaryCardId,
} from "./hooks/useMedicalSummaryCardLayout"
import {
  MedicalSummaryCardNav,
  type MedicalSummaryCardNavItem,
} from "./components/MedicalSummaryCardNav"
import { SummaryGenerationMeta } from "./components/SummaryGenerationMeta"
import {
  buildInvestigationCumulativeTargets,
  type InvestigationCumulativeTarget,
} from "./utils/investigation-cumulative-target"
import { buildSummaryGenerationInfo } from "./utils/summary-generation-info"
import { useClinicalInsightsRuntime } from "@/features/clinical-insights/ClinicalInsightsRuntimeProvider"
import { MAX_SUMMARY_INSIGHT_MODULES } from "@/src/shared/constants/clinical-insights.constants"
import type {
  EncounterClass,
  InvestigationDirection,
  InvestigationKind,
  MedicationChangeType,
  ProblemKind,
  ResolvedSourceRef,
  SummaryUrgency,
  TimelineCategory,
} from "@/src/core/entities/medical-summary.entity"

type SummaryView = "standard" | "custom"

const CARD_NAV_ACTIVATION_OFFSET_PX = 48

function findVerticalScrollContainer(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement
  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY
    if (/(auto|scroll|overlay)/.test(overflowY)) return parent
    parent = parent.parentElement
  }
  return null
}

export default function MedicalSummaryFeature() {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const { setActiveTab } = useRightPanel()
  const { diagnosticReports, observations } = useClinicalData()
  const base = t.medicalSummary
  const isPatient = audience === "patient"
  // Patient keys override the clinician base set (same pattern as safety).
  const ms = useMemo(() => (isPatient ? { ...base, ...base.patient } : base), [base, isPatient])
  const {
    panels: insightPanels,
    responses: insightResponses,
    panelStatus: insightPanelStatus,
  } = useClinicalInsightsRuntime()
  const visibleInsightPanels = useMemo(
    () => insightPanels
      .filter((panel) => panel.showInSummary)
      .slice(0, MAX_SUMMARY_INSIGHT_MODULES),
    [insightPanels],
  )
  const visibleInsightCount = visibleInsightPanels.length
  const insightsModel = useModelPref("insights")
  const setModelFor = useSetModelFor()
  const [activeView, setActiveView] = useState<SummaryView>("standard")
  const [customUnread, setCustomUnread] = useState(false)
  const [customManagerOpen, setCustomManagerOpen] = useState(false)
  const [dataScopeOpen, setDataScopeOpen] = useState(false)
  const [overflowResolutionOpen, setOverflowResolutionOpen] = useState(false)
  const [selectedCustomPanelId, setSelectedCustomPanelId] = useState<string | undefined>()
  const previousLoadingPanelsRef = useRef<Set<string>>(new Set())
  const customGenerating = visibleInsightPanels.some(
    (panel) => insightPanelStatus[panel.id]?.isLoading,
  )
  const openCustomManager = useCallback((panelId?: string) => {
    setSelectedCustomPanelId(panelId)
    setCustomManagerOpen(true)
  }, [])

  // A hidden custom tab needs one strong completion signal. Only a genuine
  // loading → completed transition creates the unread dot; cache hydration does
  // not masquerade as a newly generated result.
  useEffect(() => {
    const currentLoading = new Set(
      visibleInsightPanels
        .filter((panel) => insightPanelStatus[panel.id]?.isLoading)
        .map((panel) => panel.id),
    )
    const completedWhileHidden = [...previousLoadingPanelsRef.current].some((panelId) => {
      if (currentLoading.has(panelId)) return false
      const status = insightPanelStatus[panelId]
      return !status?.error && Boolean(insightResponses[panelId]?.text?.trim())
    })
    previousLoadingPanelsRef.current = currentLoading

    if (activeView !== "custom" && completedWhileHidden) {
      const timer = window.setTimeout(() => setCustomUnread(true), 0)
      return () => window.clearTimeout(timer)
    }
  }, [activeView, insightPanelStatus, insightResponses, visibleInsightPanels])

  // One user-facing lifecycle coordinates the independently validated summary
  // and safety pipelines. The feature no longer owns two sets of controls,
  // loading states, cache hydration, or retry behaviour.
  const {
    result,
    safetyResult,
    coverage,
    hasPatient,
    dataReady,
    model,
    autoGenerate,
    setModel,
    setAutoGenerate,
    generate,
    cancelGeneration,
    retryFailed,
    isGenerating: isBusy,
    isStopping,
    isSummaryGenerating,
    isSafetyGenerating,
    isRestoring,
    summaryError,
    safetyError,
    contextOverflowIssue,
    hasAnyResult,
    hasCompleteResult,
    resolveSafetySource,
    activeGeneration,
  } = useMedicalSummaryOrchestrator()
  const [overflowGuidance, setOverflowGuidance] = useState<ContextOverflowIssue | null>(null)

  // Keep the exact reduction target visible while the user edits the scope.
  // Changing one checkbox creates a new result slot (and clears its live
  // issue), but the drawer still needs the original target until it closes.
  useEffect(() => {
    if (contextOverflowIssue) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOverflowGuidance(contextOverflowIssue)
    } else if (!dataScopeOpen) {
      setOverflowGuidance(null)
    }
  }, [contextOverflowIssue, dataScopeOpen])

  const safetyText = useMemo(
    () => (isPatient ? { ...t.safetyAlerts, ...t.safetyAlerts.patient } : t.safetyAlerts),
    [isPatient, t.safetyAlerts],
  )
  const generationErrors = useMemo(() => [
    summaryError ? {
      label: ms.prioritiesTitle,
      message: summaryError === "PARSE_FAILED"
        ? ms.parseError
        : summaryError,
    } : null,
    safetyError ? {
      label: ms.careSafetyTitle,
      message: safetyError === "PARSE_FAILED"
        ? safetyText.parseError
        : safetyError,
    } : null,
  ].filter((item): item is { label: string; message: string } => item !== null), [ms, safetyError, safetyText.parseError, summaryError])
  const displayedGenerationErrors = useMemo(() => {
    if (
      !contextOverflowIssue ||
      contextOverflowIssue.selectedTokens === null ||
      contextOverflowIssue.suggestedSelectedMax === null
    ) return generationErrors
    return [{
      label: ms.contextOverflowInputLabel,
      message: ms.contextOverflowSummary
        .replace("{request}", formatApproxTokenCount(contextOverflowIssue.requestTokens))
        .replace("{usable}", formatApproxTokenCount(contextOverflowIssue.usable))
        .replace("{selected}", formatApproxTokenCount(contextOverflowIssue.selectedTokens))
        .replace("{target}", formatApproxTokenCount(contextOverflowIssue.suggestedSelectedMax)),
    }]
  }, [contextOverflowIssue, generationErrors, ms.contextOverflowInputLabel, ms.contextOverflowSummary])
  const generationActivity = getSummaryGenerationActivityState({
    isBusy,
    hasContextOverflow: Boolean(contextOverflowIssue),
    hasCompleteResult,
  })

  // Clinicians see raw FHIR resource types on chips; patients get plain words.
  const typeLabel = useCallback((resourceType?: string): string => {
    if (!resourceType) return ""
    if (!isPatient) return resourceType
    return (base.patient.sourceTypes as Record<string, string>)[resourceType] ?? resourceType
  }, [base.patient.sourceTypes, isPatient])
  const categoryLabel = (c: TimelineCategory) => ms.categories[c]
  const encounterClassLabel = (c: EncounterClass) => ms.encounterClasses[c]
  const problemBadgeLabel = (kind: ProblemKind) =>
    kind === "careplan"
      ? ms.problemBadgeCarePlan
      : kind === "discharge"
        ? ms.problemBadgeDischarge
        : ms.problemBadgeInferred
  const investigationKindLabel = (kind: InvestigationKind) => ms.investigationKinds[kind]
  const investigationDirectionLabel = (direction: InvestigationDirection) =>
    ms.investigationDirections[direction]
  const medicationChangeTypeLabel = (type: MedicationChangeType) =>
    type === "cross-facility"
      ? ms.medicationChangeTypes.crossFacility
      : ms.medicationChangeTypes[type]
  const urgencyLabel = (urgency: SummaryUrgency) =>
    urgency === "high" ? ms.urgencyHigh : urgency === "medium" ? ms.urgencyMedium : ms.urgencyLow

  // Navigate the LEFT panel to a cited resource. Switching to the right tab
  // always works; the pinpoint scroll is best-effort — if no anchor claims
  // the request in time (virtualised list, pivot view without per-resource
  // rows…), say so instead of failing silently.
  const navFallbackMsg = ms.navFallback
  const navigateToResource = useCallback(
    (target: ResourceNavTarget) => {
      const store = useResourceNavigationStore.getState()
      store.navigate(target)
      const mySeq = useResourceNavigationStore.getState().seq
      setTimeout(() => {
        const s = useResourceNavigationStore.getState()
        if (s.pending && s.seq === mySeq) {
          s.consume()
          const what = [target.date, target.display].filter(Boolean).join(" ")
          toast.warning(navFallbackMsg.replace("{label}", what || target.resourceType), {
            duration: 6000,
          })
        }
      }, NAV_CLAIM_TIMEOUT_MS)
    },
    [navFallbackMsg],
  )

  const investigationCumulativeTargets = useMemo(
    () => result
      ? buildInvestigationCumulativeTargets(result, diagnosticReports, observations)
      : [],
    [diagnosticReports, observations, result],
  )
  const [openingCumulativeTarget, setOpeningCumulativeTarget] = useState<InvestigationCumulativeTarget | null>(null)
  const openingCumulativeNavSeqRef = useRef<number | null>(null)
  const openingCumulativeTimerRef = useRef<number | null>(null)
  const consumedNavSeq = useResourceNavigationStore((state) => state.consumedSeq)

  useEffect(() => () => {
    if (openingCumulativeTimerRef.current !== null) {
      window.clearTimeout(openingCumulativeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const openingSeq = openingCumulativeNavSeqRef.current
    if (openingSeq === null || consumedNavSeq < openingSeq) return
    openingCumulativeNavSeqRef.current = null
    setOpeningCumulativeTarget(null)
  }, [consumedNavSeq])

  const openCumulativeReport = useCallback(
    (target: InvestigationCumulativeTarget) => {
      setOpeningCumulativeTarget(target)
      openingCumulativeNavSeqRef.current = null
      if (openingCumulativeTimerRef.current !== null) {
        window.clearTimeout(openingCumulativeTimerRef.current)
      }

      // Give React one paint to show the spinner before mounting the reports
      // feature. A local bundle can make that first mount CPU-heavy; starting
      // it in the same click task makes the button look unresponsive.
      openingCumulativeTimerRef.current = window.setTimeout(() => {
        openingCumulativeTimerRef.current = null
        navigateToResource({
          resourceType: target.resourceType,
          resourceId: target.resourceId,
          display: target.display,
          date: target.date,
          reportView: 'cumulative',
          cumulativeCategoryId: target.categoryId,
          cumulativeAnalyteKey: target.analyteKey,
        })
        openingCumulativeNavSeqRef.current = useResourceNavigationStore.getState().seq
      }, 50)
    },
    [navigateToResource],
  )

  // Render a safety alert's cited source keys as a navigable citation — the
  // same SourceSup the narrative/decision cards use. Resolves each key against
  // the safety catalog; unknown keys show as unverified (never dropped).
  const renderSafetySources = useCallback(
    (keys: string[], unsupportedKeys: string[] = []) => {
      if (!keys?.length) return null
      const unsupported = new Set(unsupportedKeys)
      const refs: ResolvedSourceRef[] = keys.map((key, i) => {
        const e = resolveSafetySource(key)
        return {
          key,
          num: i + 1,
          verified: !!e && !unsupported.has(key),
          resourceType: e?.resourceType,
          resourceId: e?.resourceId,
          display: e?.display,
          date: e?.date,
          organization: e?.organization,
        }
      })
      return (
        <SourceSup
          sources={refs}
          typeLabel={typeLabel}
          unverifiedLabel={ms.unverified}
          onNavigate={navigateToResource}
        />
      )
    },
    [resolveSafetySource, typeLabel, ms.unverified, navigateToResource],
  )

  const generatedByLine = ms.generatedBy
    .replace("{enc}", String(coverage?.encounters ?? 0))
    .replace("{med}", String(coverage?.medications ?? 0))
    .replace("{lab}", String(coverage?.labs ?? 0))
    .replace("{org}", String(coverage?.organizations ?? 0))

  const [summarySettingsOpen, setSummarySettingsOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [activeCardId, setActiveCardId] = useState<MedicalSummaryCardId | null>(null)
  const cardRefs = useRef<Partial<Record<MedicalSummaryCardId, HTMLDivElement | null>>>({})

  const showSafetyCard = Boolean(safetyResult || (!safetyError && result))
  const availableCardIds = useMemo<MedicalSummaryCardId[]>(() => {
    const ids: MedicalSummaryCardId[] = []
    if (result) ids.push("problems")
    if (result?.timeline.length) ids.push("timeline")
    if (showSafetyCard) ids.push("safety")
    if (result?.decisions.length) ids.push("decisions")
    if (result) ids.push("investigations")
    if (result) ids.push("medications")
    return ids
  }, [result, showSafetyCard])

  const cardLayout = useMedicalSummaryCardLayout({ audience, availableIds: availableCardIds })

  const cardMetadata = useMemo<Record<MedicalSummaryCardId, Omit<MedicalSummaryCardLayoutItem, "id">>>(() => ({
    problems: {
      label: ms.navProblems,
      description: ms.problemsTitle,
    },
    timeline: {
      label: ms.navTimeline,
      description: ms.timelineTitle,
    },
    safety: {
      label: ms.navSafety,
      description: ms.careSafetyTitle,
    },
    decisions: {
      label: ms.navDecisions,
      description: ms.decisionsTitle,
    },
    investigations: {
      label: ms.navInvestigations,
      description: ms.investigationsTitle,
    },
    medications: {
      label: ms.navMedications,
      description: isPatient ? ms.medicationEducationTitle : ms.medicationReviewTitle,
    },
  }), [isPatient, ms])

  const layoutItems = useMemo<MedicalSummaryCardLayoutItem[]>(
    () => cardLayout.orderedManageIds.map((id) => ({ id, ...cardMetadata[id] })),
    [cardLayout.orderedManageIds, cardMetadata],
  )

  const cardCounts = useMemo<Partial<Record<MedicalSummaryCardId, number | undefined>>>(() => {
    if (!result) {
      return { safety: safetyResult?.alerts.length }
    }
    const medicationCount = isPatient
      ? result.medicationEducation.length
      : result.medicationReview.regimen.length
        + result.medicationReview.changes.length
        + result.medicationReview.reconciliation.length
    return {
      problems: result.problems.length,
      timeline: result.timeline.length,
      safety: safetyResult?.alerts.length,
      decisions: result.decisions.length,
      investigations: result.investigations.length,
      medications: medicationCount,
    }
  }, [isPatient, result, safetyResult])

  const cardNavItems = useMemo<MedicalSummaryCardNavItem[]>(
    () => cardLayout.orderedVisibleIds.map((id) => ({
      id,
      label: cardMetadata[id].label,
      compactLabel: ms.compactNavLabels[id],
      description: cardMetadata[id].description,
      count: cardCounts[id],
    })),
    [cardCounts, cardLayout.orderedVisibleIds, cardMetadata, ms.compactNavLabels],
  )
  const summaryGenerationInfo = useMemo(() => {
    return buildSummaryGenerationInfo({
      generation: result?.generation,
      locale,
      labelTemplate: ms.summaryGenerationProvenance,
      labelWithDurationTemplate: ms.summaryGenerationProvenanceWithDuration,
      durationLabel: ms.summaryGenerationDurationLabel,
      preGeneratedLabel: ms.summaryPreGeneratedLabel,
      preGeneratedTemplate: ms.summaryPreGeneratedProvenance,
    })
  }, [
    locale,
    ms.summaryGenerationDurationLabel,
    ms.summaryGenerationProvenance,
    ms.summaryGenerationProvenanceWithDuration,
    ms.summaryPreGeneratedLabel,
    ms.summaryPreGeneratedProvenance,
    result,
  ])

  const navActiveCardId = activeCardId && cardLayout.orderedVisibleIds.includes(activeCardId)
    ? activeCardId
    : cardLayout.orderedVisibleIds[0]

  useEffect(() => {
    if (activeView !== "standard") return

    const cards = cardLayout.orderedVisibleIds.flatMap((id) => {
      const element = cardRefs.current[id]
      return element ? [{ id, element }] : []
    })
    if (cards.length === 0) return

    const scrollContainer = findVerticalScrollContainer(cards[0].element)
    const scrollTarget: HTMLElement | Window = scrollContainer ?? window
    let animationFrame = 0

    const updateActiveCard = () => {
      animationFrame = 0
      const containerRect = scrollContainer?.getBoundingClientRect()
      const viewportTop = containerRect?.top ?? 0
      const viewportBottom = containerRect?.bottom ?? window.innerHeight
      const activationLine = viewportTop + CARD_NAV_ACTIVATION_OFFSET_PX
      const visibleCards = cards
        .map(({ id, element }) => ({ id, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > viewportTop && rect.top < viewportBottom)

      if (visibleCards.length === 0) return

      const isAtBottom = scrollContainer
        ? Math.ceil(scrollContainer.scrollTop + scrollContainer.clientHeight)
          >= scrollContainer.scrollHeight - 1
        : Math.ceil(window.scrollY + window.innerHeight)
          >= document.documentElement.scrollHeight - 1
      const nextCardId = isAtBottom
        ? visibleCards[visibleCards.length - 1].id
        : visibleCards.find(({ rect }) => rect.top <= activationLine && rect.bottom > activationLine)?.id
          ?? visibleCards.find(({ rect }) => rect.top > activationLine)?.id
          ?? visibleCards[visibleCards.length - 1].id

      setActiveCardId((current) => current === nextCardId ? current : nextCardId)
    }

    const scheduleUpdate = () => {
      if (animationFrame !== 0) return
      animationFrame = window.requestAnimationFrame(updateActiveCard)
    }

    scrollTarget.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", scheduleUpdate)
    scheduleUpdate()

    return () => {
      scrollTarget.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", scheduleUpdate)
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
    }
  }, [activeView, cardLayout.orderedVisibleIds])

  const jumpToCard = useCallback((id: MedicalSummaryCardId) => {
    const target = cardRefs.current[id]
    if (!target) return
    setActiveCardId(id)
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
  }, [])

  const summaryCards: Partial<Record<MedicalSummaryCardId, ReactNode>> = {
    problems: result ? (
      <div
        id="medical-summary-card-problems"
        ref={(node) => { cardRefs.current.problems = node }}
        className="scroll-mt-12"
      >
        <ProblemListCard
          result={result}
          title={ms.problemsTitle}
          basisLabel={ms.problemBasisLabel}
          badgeLabel={problemBadgeLabel}
          typeLabel={typeLabel}
          unverifiedLabel={ms.unverified}
          sourceTypeMismatchLabel={ms.sourceTypeMismatch}
          showMoreLabel={ms.showMoreItems}
          showLessLabel={ms.showLessItems}
          onNavigate={navigateToResource}
        />
      </div>
    ) : null,
    timeline: result?.timeline.length ? (
      <div
        id="medical-summary-card-timeline"
        ref={(node) => { cardRefs.current.timeline = node }}
        className="scroll-mt-12"
      >
        <CrossFacilityTimeline
          result={result}
          title={ms.timelineTitle}
          categoryLabel={categoryLabel}
          encounterClassLabel={encounterClassLabel}
          onNavigate={navigateToResource}
          earlierLabel={ms.timelineShowEarlier}
          collapseLabel={ms.timelineShowLess}
          droppedNote={
            result.droppedTimelineCount > 0
              ? ms.timelineDropped.replace("{count}", String(result.droppedTimelineCount))
              : null
          }
        />
      </div>
    ) : null,
    safety: showSafetyCard ? (
      <div
        id="medical-summary-card-safety"
        ref={(node) => { cardRefs.current.safety = node }}
        className="scroll-mt-12"
      >
        <CareRemindersSafetyCard
          result={safetyResult}
          isScanning={isSafetyGenerating}
          error={null}
          hasPatient={hasPatient}
          renderSources={renderSafetySources}
          title={ms.careSafetyTitle}
        />
      </div>
    ) : null,
    decisions: result?.decisions.length ? (
      <div
        id="medical-summary-card-decisions"
        ref={(node) => { cardRefs.current.decisions = node }}
        className="scroll-mt-12"
      >
        <DecisionList
          result={result}
          title={ms.decisionsTitle}
          urgencyLabel={urgencyLabel}
          basisLabel={ms.basisLabel}
          aiInferredLabel={ms.aiInferred}
          showUrgency={!isPatient}
          typeLabel={typeLabel}
          unverifiedLabel={ms.unverified}
          showMoreLabel={ms.showMoreItems}
          showLessLabel={ms.showLessItems}
          onNavigate={navigateToResource}
        />
      </div>
    ) : null,
    investigations: result ? (
      <div
        id="medical-summary-card-investigations"
        ref={(node) => { cardRefs.current.investigations = node }}
        className="scroll-mt-12"
      >
        <InvestigationTrendsCard
          result={result}
          title={ms.investigationsTitle}
          subtitle={ms.investigationsSubtitle}
          kindLabel={investigationKindLabel}
          directionLabel={investigationDirectionLabel}
          typeLabel={typeLabel}
          unverifiedLabel={ms.unverified}
          showMoreLabel={ms.showMoreItems}
          showLessLabel={ms.showLessItems}
          openCumulativeLabel={ms.openCumulativeReport}
          openingCumulativeLabel={ms.openingCumulativeReport}
          cumulativeTargets={investigationCumulativeTargets}
          openingCumulativeTarget={openingCumulativeTarget}
          onOpenCumulative={openCumulativeReport}
          onNavigate={navigateToResource}
        />
      </div>
    ) : null,
    medications: result ? (
      <div
        id="medical-summary-card-medications"
        ref={(node) => { cardRefs.current.medications = node }}
        className="scroll-mt-12"
      >
        {isPatient ? (
          <MedicationEducationCard
            result={result}
            title={ms.medicationEducationTitle}
            benefitLabel={ms.medicationBenefitLabel}
            attentionLabel={ms.medicationAttentionLabel}
            disclaimer={ms.medicationEducationDisclaimer}
            typeLabel={typeLabel}
            unverifiedLabel={ms.unverified}
            showMoreLabel={ms.showMoreItems}
            showLessLabel={ms.showLessItems}
            onNavigate={navigateToResource}
          />
        ) : (
          <MedicationReconciliationCard
            result={result}
            title={ms.medicationReviewTitle}
            regimenTitle={ms.medicationReviewRegimenTitle}
            changesTitle={ms.medicationReviewChangesTitle}
            reconciliationTitle={ms.medicationReviewReconciliationTitle}
            disclaimer={ms.medicationReviewDisclaimer}
            changeTypeLabel={medicationChangeTypeLabel}
            typeLabel={typeLabel}
            unverifiedLabel={ms.unverified}
            showMoreLabel={ms.showMoreItems}
            showLessLabel={ms.showLessItems}
            onNavigate={navigateToResource}
          />
        )}
      </div>
    ) : null,
  }

  return (
    // @container drives the responsive split off the PANEL's own width, not the
    // viewport — the right panel is ~700px in a split view but ~1900px once the
    // left panel collapses, and only container queries see that. Capped so the
    // two columns never exceed a readable line length on ultrawide screens.
    <div className="@container mx-auto max-w-[84rem] space-y-2 py-0.5">
      <Tabs
        value={activeView}
        onValueChange={(value) => {
          const next = value as SummaryView
          setActiveView(next)
          if (next === "custom") {
            setCustomUnread(false)
            setSummarySettingsOpen(false)
          }
        }}
        className="gap-2"
      >
      <div className="flex flex-wrap items-center gap-1.5 @min-[36rem]:flex-nowrap">
        <ClipboardList className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
        <h2 className="shrink-0 text-base font-semibold text-foreground">{ms.title}</h2>
        <span className="shrink-0 rounded-md bg-teal-100 px-2 py-0.5 text-[0.6875rem] font-medium text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
          {ms.badge}
        </span>
        <TabsList className="h-7 w-auto rounded-lg p-0.5 shadow-none">
          <TabsTrigger
            value="standard"
            aria-label={ms.standardSummaryTab}
            className="min-w-14 rounded-md px-2 py-0.5 text-xs focus-visible:border-teal-500 focus-visible:ring-teal-400/40 data-[state=active]:border-teal-300 data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800 dark:data-[state=active]:border-teal-700 dark:data-[state=active]:bg-teal-950/70 dark:data-[state=active]:text-teal-200"
          >
            {ms.standardSummaryTabShort}
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            title={ms.customInsightsSubtitle}
            aria-label={ms.customSummaryTab}
            className="group relative min-w-16 rounded-md px-2 py-0.5 text-xs focus-visible:border-violet-500 focus-visible:ring-violet-400/40 data-[state=active]:border-violet-300 data-[state=active]:bg-violet-100 data-[state=active]:text-violet-800 dark:data-[state=active]:border-violet-700 dark:data-[state=active]:bg-violet-950/70 dark:data-[state=active]:text-violet-200"
          >
            <span>{ms.customSummaryTabShort}</span>
            {visibleInsightCount > 0 ? (
              <span className="rounded-full bg-muted px-1.5 py-0 text-[0.625rem] tabular-nums text-muted-foreground group-data-[state=active]:bg-violet-200 group-data-[state=active]:text-violet-800 dark:group-data-[state=active]:bg-violet-800 dark:group-data-[state=active]:text-violet-100">
                {visibleInsightCount}
              </span>
            ) : null}
            {customGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin text-violet-500" aria-label={ms.customGenerating} />
            ) : customUnread ? (
              <span
                className="h-2 w-2 rounded-full bg-violet-500"
                title={ms.customSummaryUnread}
                aria-label={ms.customSummaryUnread}
              />
            ) : null}
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-1.5">
          {activeView === "standard" ? (
            <ModelPicker
              modelId={model}
              fallbackModelId={MEDICAL_SUMMARY_MODEL_ID}
              onSelect={setModel}
              tooltip={t.safetyAlerts.modelTooltip}
              compact
            />
          ) : (
            <ModelPicker
              modelId={insightsModel}
              fallbackModelId={MODEL_PREF_DEFAULTS.insights}
              onSelect={(id) => setModelFor("insights", id)}
              tooltip={t.modelPicker.insightsTooltip}
              align="end"
              compact
            />
          )}
          {activeView === "standard" ? (
            hasPatient && dataReady ? (
              <SummaryGenerationButton
                isBusy={isBusy}
                isStopping={isStopping}
                isRestoring={isRestoring}
                hasContextOverflow={Boolean(contextOverflowIssue)}
                hasAnyResult={hasAnyResult}
                labels={{
                  generate: ms.generate,
                  regenerate: ms.regenerate,
                  stop: ms.stopGeneration,
                  stopping: ms.stoppingGeneration,
                  resolveOverflow: ms.contextOverflowGenerateAction,
                }}
                onGenerate={() => void generate()}
                onStop={cancelGeneration}
                onResolveOverflow={() => setOverflowResolutionOpen(true)}
              />
            ) : null
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => openCustomManager()}
              title={`${ms.manageCustomInsights}。${ms.customManagerDescription}`}
              aria-label={ms.manageCustomInsights}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden @min-[38rem]:inline">{ms.manageCustomInsights}</span>
            </Button>
          )}
          <Popover open={summarySettingsOpen} onOpenChange={setSummarySettingsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={summarySettingsOpen || dataScopeOpen ? "secondary" : "outline"}
                className="h-7 gap-1 px-2 text-xs"
                title={ms.summaryControls}
                aria-label={ms.summaryControls}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {t.tabs.settings}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-1 p-2">
              {activeView === "standard" ? (
                <label
                  className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
                  title={ms.autoGenerateTooltip}
                >
                  <span className="font-medium text-foreground">{ms.autoGenerate}</span>
                  <Switch checked={autoGenerate} onCheckedChange={setAutoGenerate} className="scale-90" />
                </label>
              ) : null}
              <Button
                type="button"
                data-testid="medical-summary-data-scope-trigger"
                size="sm"
                variant="ghost"
                className="h-8 w-full justify-start gap-2 px-2 text-xs"
                onClick={() => {
                  setSummarySettingsOpen(false)
                  setDataScopeOpen(true)
                }}
                disabled={!hasPatient}
                title={hasPatient ? ms.dataScopeDescription : ms.dataScopeRequiresPatient}
              >
                <Database className="h-3.5 w-3.5" />
                {ms.dataScopeButton}
              </Button>
              {activeView === "standard" && !isPatient && availableCardIds.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-full justify-start gap-2 px-2 text-xs"
                  onClick={() => {
                    setSummarySettingsOpen(false)
                    setLayoutOpen(true)
                  }}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  {ms.cardLayoutButton}
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <MedicalSummaryCardLayoutManager
        open={layoutOpen}
        onOpenChange={setLayoutOpen}
        items={layoutItems}
        hiddenIds={cardLayout.hiddenSet}
        onMove={cardLayout.moveCard}
        onReset={cardLayout.resetLayout}
        onVisibleChange={cardLayout.setCardVisible}
        labels={{
          title: ms.cardLayoutTitle,
          description: ms.cardLayoutDescription,
          reset: ms.cardLayoutReset,
          visible: ms.cardVisible,
          hidden: ms.cardHidden,
          moveUp: ms.cardMoveUp,
          moveDown: ms.cardMoveDown,
          showCard: ms.cardShow,
          hideCard: ms.cardHide,
          empty: ms.cardLayoutEmpty,
        }}
      />

        <TabsContent value="standard" forceMount className="mt-0 space-y-2">
      {!hasPatient ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{ms.emptyNoPatient}</div>
      ) : !dataReady ? (
        <div className="py-10 flex justify-center">
          <StreamingIndicator label={ms.loadingData} />
        </div>
      ) : isRestoring ? (
        <div className="py-10 flex justify-center">
          <StreamingIndicator label={ms.loadingSavedSummary} />
        </div>
      ) : generationActivity.showBlockingLoader ? (
        <div className="rounded-xl border border-border bg-card px-3 py-8">
          <div className="flex flex-col items-center gap-2">
            {isStopping ? (
              <div
                className="flex items-center gap-2 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                {ms.stoppingGeneration}
              </div>
            ) : (
              <>
                <div className="sr-only" role="status" aria-live="polite">
                  {ms.generating}
                </div>
                <SummaryGenerationMeta
                  activeGeneration={activeGeneration}
                  runningLabel={ms.summaryGenerationRunningLabel}
                  runningAriaTemplate={ms.summaryGenerationRunningProvenance}
                  className="max-w-full text-xs"
                />
                <p className="text-xs text-muted-foreground/70">{ms.generatingHint}</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {displayedGenerationErrors.length > 0 && generationActivity.showGenerationErrors ? (
            <GenerationErrorBanner
              key={displayedGenerationErrors.map((item) => `${item.label}:${item.message}`).join("|")}
              title={contextOverflowIssue ? ms.contextOverflowTitle : ms.partialGenerationError}
              errors={displayedGenerationErrors}
              retryLabel={t.errors.retry}
              closeLabel={t.common.close}
              isBusy={generationActivity.actionBusy}
              onRetry={() => void retryFailed()}
              actions={contextOverflowIssue ? [
                {
                  label: ms.adjustDataScope,
                  onClick: () => setDataScopeOpen(true),
                  icon: <Database className="h-3 w-3" />,
                },
                ...(model === CUSTOM_OPENAI_MODEL_ID ? [{
                  label: ms.contextWindowSettings,
                  onClick: () => setActiveTab(
                    "settings",
                    "ai",
                    "openai-compatible-context-window",
                  ),
                  icon: <Settings2 className="h-3 w-3" />,
                  variant: "outline" as const,
                }] : []),
              ] : undefined}
            />
          ) : null}

          <MedicalSummaryCardNav
            items={cardNavItems}
            ariaLabel={ms.cardNavigation}
            activeId={navActiveCardId}
            onJump={jumpToCard}
            generationInfo={summaryGenerationInfo}
            activeGeneration={activeGeneration}
            runningLabel={ms.summaryGenerationRunningLabel}
            runningAriaTemplate={ms.summaryGenerationRunningProvenance}
          />

          {result ? (
            <CurrentPrioritiesCard
              result={result}
              title={ms.prioritiesTitle}
              generatedByLine={generatedByLine}
              expandSummaryLabel={ms.expandSummary}
              collapseSummaryLabel={ms.collapseSummary}
              typeLabel={typeLabel}
              unverifiedLabel={ms.unverified}
              onNavigate={navigateToResource}
              updating={isSummaryGenerating}
            />
          ) : null}

          {availableCardIds.length > 0 && cardLayout.orderedVisibleIds.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-5 text-center text-xs text-muted-foreground">
              {ms.allCardsHidden}
            </div>
          ) : (
            <div className="space-y-2">
              {cardLayout.orderedVisibleIds.map((cardId) => (
                <Fragment key={cardId}>{summaryCards[cardId] ?? null}</Fragment>
              ))}
            </div>
          )}

          {coverage ? (
            <CoverageCard
              coverage={coverage}
              labels={{
                range: ms.coverageRange,
                orgs: ms.coverageOrgs,
                encounters: ms.coverageEncounters,
                medications: ms.coverageMeds,
                labs: ms.coverageLabs,
                boundary: ms.coverageBoundary,
              }}
              statsVisible={!isPatient}
            />
          ) : null}

          <p className="pb-0.5 text-center text-[0.65rem] leading-snug text-muted-foreground/60">
            {ms.secondLayerNote}
          </p>
        </>
      )}
        </TabsContent>

        <TabsContent value="custom" forceMount className="mt-0">
          <CustomInsightModulesSection onManage={openCustomManager} />
        </TabsContent>
      </Tabs>
      <DataSelectionDrawer
        open={dataScopeOpen}
        onOpenChange={setDataScopeOpen}
        title={ms.dataScopeTitle}
        description={ms.dataScopeDescription}
        applyHint={ms.dataScopeApplyHint}
        modelId={activeView === "standard" ? model : insightsModel}
        fallbackModelId={activeView === "standard" ? MEDICAL_SUMMARY_MODEL_ID : MODEL_PREF_DEFAULTS.insights}
        overflowIssue={activeView === "standard" ? overflowGuidance : null}
      />
      <CustomInsightModulesManagerDrawer
        open={customManagerOpen}
        onOpenChange={setCustomManagerOpen}
        initialPanelId={selectedCustomPanelId}
      />
      <AlertDialog open={overflowResolutionOpen} onOpenChange={setOverflowResolutionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ms.contextOverflowResolveTitle}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {contextOverflowIssue ? (
                <span className="block font-medium text-foreground">
                  {displayedGenerationErrors[0]?.message}
                </span>
              ) : null}
              <span className="block">
                {model === CUSTOM_OPENAI_MODEL_ID
                  ? ms.contextOverflowResolveDescription
                  : ms.contextOverflowResolveCloudDescription}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            {model === CUSTOM_OPENAI_MODEL_ID ? (
              <AlertDialogAction
                className="border border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setOverflowResolutionOpen(false)
                  setActiveTab("settings", "ai", "openai-compatible-context-window")
                }}
              >
                {ms.contextWindowSettings}
              </AlertDialogAction>
            ) : null}
            <AlertDialogAction
              onClick={() => {
                setOverflowResolutionOpen(false)
                setDataScopeOpen(true)
              }}
            >
              {ms.adjustDataScope}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
