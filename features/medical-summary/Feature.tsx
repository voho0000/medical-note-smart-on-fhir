// Medical Summary (醫療摘要) — one feature with two reading modes:
// 初診快覽 (the fixed first-visit overview) and independently generated custom
// summaries. Structured AI output (Zod-validated) renders as a single scroll
// column of fixed sections — never a free-text markdown blob, and no longer a
// re-orderable card deck. Pluggable via right-panel-registry (enabled flag).
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
import { BookOpen, CircleHelp, ClipboardList, Database, Loader2, Settings2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useRightPanel } from "@/src/application/providers/right-panel.provider"
import { StreamingIndicator } from "@/src/shared/components/StreamingIndicator"
import { useMedicalSummaryOrchestrator } from "@/src/application/hooks/medical-summary/use-medical-summary-orchestrator.hook"
import {
  useResourceNavigationStore,
  NAV_CLAIM_TIMEOUT_MS,
  type ResourceNavTarget,
} from "@/src/application/stores/resource-navigation.store"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ModelPicker } from "@/src/shared/components/ModelPicker"
import { InfoHint } from "@/src/shared/components/InfoHint"
import {
  SUBTAB_LIST_CLASSES,
  SUBTAB_TRIGGER_CLASSES,
} from "@/src/shared/config/ui-theme.config"
import {
  MODEL_PREF_DEFAULTS,
  useModelPref,
  useSetModelFor,
} from "@/src/application/stores/model-prefs.store"
import { MEDICAL_SUMMARY_MODEL_ID } from "@/src/core/use-cases/medical-summary/generate-medical-summary.use-case"
import {
  isCustomOpenAiModelId,
  openAiCompatibleProfileIdFromModelId,
} from "@/src/shared/constants/ai-models.constants"
import { formatApproxTokenCount, type ContextOverflowIssue } from "@/src/shared/utils/context-budget"
import { formatClinicalContextAdaptationNotice } from "@/src/core/utils/adaptive-clinical-context.utils"
import { OverviewHeroCard } from "./components/OverviewHeroCard"
import { FocusCard } from "./components/FocusCard"
import { ProblemsCard } from "./components/ProblemsCard"
import { RecentEventsCard } from "./components/RecentEventsCard"
import { ReportHighlightsCard } from "./components/ReportHighlightsCard"
import { OtherAlertsDisclosure } from "./components/OtherAlertsDisclosure"
import { MedicationEducationCard } from "./components/MedicationEducationCard"
import { CoverageCard } from "./components/CoverageCard"
import { SummaryStatusStrip } from "./components/SummaryStatusStrip"
import { GenerationErrorBanner } from "./components/GenerationErrorBanner"
import {
  SummarySectionPending,
} from "./components/SummarySectionStatus"
import {
  getSummaryGenerationActivityState,
  SummaryGenerationButton,
} from "./components/SummaryGenerationButton"
import { AiDiagnosticsButton } from "./components/AiDiagnosticsButton"
import { SourceSup } from "./components/SourceSup"
import { CustomInsightModulesSection } from "./components/CustomInsightModulesSection"
import { CustomInsightModulesManagerDrawer } from "./components/CustomInsightModulesManagerDrawer"
import {
  isCustomSummaryEditorTourStep,
  isCustomSummaryTourStep,
  useRightFeatureTourStore,
} from "@/features/right-feature-tour/right-feature-tour.store"
import { DataSelectionDrawer } from "@/features/data-selection"
import { SummaryGenerationMeta } from "./components/SummaryGenerationMeta"
import { consolidateCardErrors } from "./utils/consolidate-card-errors"
import { buildSummaryGenerationInfo } from "./utils/summary-generation-info"
import { useClinicalInsightsRuntime } from "@/features/clinical-insights/ClinicalInsightsRuntimeProvider"
import { MAX_SUMMARY_INSIGHT_MODULES } from "@/src/shared/constants/clinical-insights.constants"
import { MEDICAL_SUMMARY_CARD_IDS } from "@/src/core/entities/medical-summary.entity"
import type {
  EncounterClass,
  MedicalSummaryModuleId,
  MedicalSummaryCardId,
  ResolvedSourceRef,
} from "@/src/core/entities/medical-summary.entity"
import { SEVERITY_RANK } from "@/src/core/entities/safety-alert.entity"
import { useAiExecutionDiagnosticsStore } from "@/src/application/stores/ai-execution-diagnostics.store"
import { useSummaryActivity } from "@/src/application/hooks/medical-summary/use-summary-activity.hook"
import { downloadAiExecutionDiagnostics } from "@/src/shared/utils/ai-execution-diagnostics"
import { AiExecutionDiagnosticsDialog } from "@/src/shared/components/AiExecutionDiagnosticsDialog"
import { useMedcloudAutoSummary } from "@/src/application/hooks/medical-summary/use-medcloud-auto-summary.hook"

type SummaryView = "standard" | "custom"

import { markUserTrigger, useTrackView } from "@/src/application/telemetry/usage-analytics"

export default function MedicalSummaryFeature() {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const { loading: authLoading } = useAuth()
  const { activeTab: rightPanelTab, setActiveTab } = useRightPanel()
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
  const [selectedView, setActiveView] = useState<SummaryView>("standard")
  const tourActive = useRightFeatureTourStore((state) => state.active)
  const tourStep = useRightFeatureTourStore((state) => state.stepId)
  const openCustomSummaryGuide = useRightFeatureTourStore((state) => state.openCustomSummaryGuide)
  // Tour navigation is presentation-only. Once it ends, restore the clinician's
  // selected reading mode and drawer state without mutating template settings.
  const activeView = tourActive
    ? (isCustomSummaryTourStep(tourStep) ? "custom" : "standard")
    : selectedView
  const tourEditorOpen = tourActive && isCustomSummaryEditorTourStep(tourStep)
  // Usage analytics: 標準 vs 自訂 reading mode, default included. Tour-driven
  // views report as `auto` because only the tab handler marks a user trigger.
  // Gated on the right panel actually showing this feature — visited right-panel
  // tabs stay mounted for the rest of the session.
  useTrackView('summary', activeView, rightPanelTab === 'medical-summary')
  const [customUnread, setCustomUnread] = useState(false)
  const [customManagerOpen, setCustomManagerOpen] = useState(false)
  const [dataScopeOpen, setDataScopeOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
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
    modelUnavailable,
    autoGenerate,
    setModel,
    setAutoGenerate,
    generate,
    cancelGeneration,
    retryFailed,
    isGenerating: isBusy,
    isStopping,
    isSafetyGenerating,
    isRestoring,
    summaryError,
    cardErrors,
    safetyError,
    contextOverflowIssue,
    contextAdaptation,
    hasAnyResult,
    resolveSafetySource,
    activeGeneration,
    summaryGenerationSlotKey,
    safetyGenerationSlotKey,
  } = useMedicalSummaryOrchestrator()
  useMedcloudAutoSummary({
    authLoading,
    hasPatient,
    // `result` is already scoped to the current patient, FHIR input signature,
    // locale, audience, and selected model cache slot. Matching provenance
    // therefore proves this patient does not need another launch run.
    summaryModelId: result?.generation?.modelId ?? null,
    dataReady,
    isGenerating: isBusy,
    isRestoring,
    generationSlotKey: summaryGenerationSlotKey,
    modelId: model,
    generate,
  })
  // Mirror the run's start/finish into the workspace-level activity store so a
  // COLLAPSED feature panel can announce a finished summary. Content never
  // travels — only the fact that a run ended.
  useSummaryActivity({
    busy: isBusy,
    scope: summaryGenerationSlotKey,
    completedAt: result?.generation?.source === 'live' ? result.generation.completedAt : undefined,
    failed: !!summaryError || !!safetyError,
  })

  const allAiDiagnostics = useAiExecutionDiagnosticsStore((state) => state.records)
  const visibleAiDiagnostics = useMemo(() => {
    if (activeView === "custom") {
      return allAiDiagnostics.filter((record) => record.feature === "clinical-insights")
    }
    return allAiDiagnostics.filter((record) => (
      record.operationKey === summaryGenerationSlotKey ||
      record.operationKey === safetyGenerationSlotKey
    ))
  }, [activeView, allAiDiagnostics, safetyGenerationSlotKey, summaryGenerationSlotKey])
  const exportAiDiagnostics = useCallback(() => {
    if (visibleAiDiagnostics.length === 0) return
    downloadAiExecutionDiagnostics(
      activeView === "custom" ? "medical-summary-custom" : "medical-summary",
      visibleAiDiagnostics,
    )
  }, [activeView, visibleAiDiagnostics])
  const exportOneAiDiagnostic = useCallback((index: number) => {
    const record = visibleAiDiagnostics[index]
    if (!record) return
    downloadAiExecutionDiagnostics(
      activeView === "custom" ? "medical-summary-custom" : "medical-summary",
      [record],
    )
  }, [activeView, visibleAiDiagnostics])
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
  const cardLabels = useMemo<Record<MedicalSummaryCardId, string>>(() => ({
    overview: ms.overviewTitle,
    focus: ms.focusTitle,
    problems: ms.problemsTitle,
    recent: ms.recentTitle,
    reports: ms.reportsTitle,
    safety: ms.otherAlertsSectionLabel,
  }), [ms])
  const generationErrors = useMemo(() => {
    const failedCards = MEDICAL_SUMMARY_CARD_IDS.flatMap((cardId) => {
      const error = cardId === "safety" ? safetyError ?? cardErrors.safety : cardErrors[cardId]
      return error ? [{
        label: cardLabels[cardId],
        message: error === "PARSE_FAILED"
          ? cardId === "safety" ? safetyText.parseError : ms.parseError
          : error,
      }] : []
    })
    const genericSummaryError = summaryError && summaryError !== "MODULES_FAILED"
      ? [{
          label: modelUnavailable ? t.modelPicker.label : ms.overviewTitle,
          message: summaryError === "PARSE_FAILED" ? ms.parseError : summaryError,
        }]
      : []
    // A legacy/restored safety slot can still expose its error separately from
    // result.cardErrors. Surface it in the same banner without duplicating an
    // integrated safety-card error.
    const standaloneSafetyError = safetyError && !cardErrors.safety
      ? [{
          label: cardLabels.safety,
          message: safetyError === "PARSE_FAILED" ? safetyText.parseError : safetyError,
        }]
      : []
    // Consolidation counts against the standard card ids, so the standalone
    // slot stays outside it. `safety` is one of those ids, so the two are
    // mutually exclusive anyway: consolidating needs cardErrors.safety set.
    return [
      // The patient version never requests 影像與病理重點, so "every card
      // failed" counts one card fewer there.
      ...consolidateCardErrors(
        failedCards,
        ms.title,
        MEDICAL_SUMMARY_CARD_IDS.length - (isPatient ? 1 : 0),
      ),
      ...standaloneSafetyError,
      ...genericSummaryError,
    ]
  }, [
    cardErrors,
    cardLabels,
    isPatient,
    ms,
    safetyError,
    modelUnavailable,
    safetyText.parseError,
    summaryError,
    t.modelPicker.label,
  ])
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
    hasAnyResult,
  })

  // Clinicians see raw FHIR resource types on chips; patients get plain words.
  const typeLabel = useCallback((resourceType?: string): string => {
    if (!resourceType) return ""
    if (!isPatient) return resourceType
    return (base.patient.sourceTypes as Record<string, string>)[resourceType] ?? resourceType
  }, [base.patient.sourceTypes, isPatient])
  const encounterClassLabel = useCallback(
    (encounterClass: EncounterClass) => ms.encounterClasses[encounterClass],
    [ms.encounterClasses],
  )

  // Navigate the LEFT panel to a cited resource. Switching to the right tab
  // always works; the pinpoint scroll is best-effort — if no anchor claims
  // the request in time (virtualised list, pivot view without per-resource
  // rows…), say so instead of failing silently.
  const navFallbackMsg = ms.navFallback
  const navigateToResource = useCallback(
    (target: ResourceNavTarget) => {
      const store = useResourceNavigationStore.getState()
      // Every citation in this feature (summary sections AND the safety scan)
      // routes through here; a caller that already knows better wins.
      store.navigate({ ...target, origin: target.origin ?? 'summary' })
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

  // Render a safety alert's cited source keys as a navigable citation — the
  // same SourceSup the summary sections use. Resolves each key against the
  // safety catalog; unknown keys show as unverified (never dropped).
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

  const [summarySettingsOpen, setSummarySettingsOpen] = useState(false)
  const [summaryModelPickerOpen, setSummaryModelPickerOpen] = useState(false)
  const summaryModelPickerTriggerRef = useRef<HTMLButtonElement>(null)

  const revealSummaryModelPicker = useCallback(() => {
    const trigger = summaryModelPickerTriggerRef.current
    if (!trigger) return
    trigger.scrollIntoView({ block: "center" })
    trigger.focus({ preventScroll: true })
    setSummaryModelPickerOpen(true)
  }, [])

  const moduleReady = useCallback(
    (moduleId: MedicalSummaryModuleId) => Boolean(
      result &&
      (!result.completedCardIds || result.completedCardIds.includes(moduleId)) &&
      !cardErrors[moduleId]
    ),
    [cardErrors, result],
  )
  // A section that has neither landed nor failed is still streaming — show its
  // own placeholder rather than a hole in the column.
  const modulePending = useCallback(
    (moduleId: MedicalSummaryModuleId) =>
      isBusy && !cardErrors[moduleId] && !moduleReady(moduleId),
    [cardErrors, isBusy, moduleReady],
  )

  // High-severity alerts join 開藥前必看; everything else folds into the closed
  // disclosure at the very bottom. The safety scan settles independently of the
  // summary modules, so the hero legitimately gains rows mid-stream.
  const { highAlerts, otherAlerts } = useMemo(() => {
    const sorted = [...(safetyResult?.alerts ?? [])].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    )
    return {
      highAlerts: sorted.filter((alert) => alert.severity === "high"),
      otherAlerts: sorted.filter((alert) => alert.severity !== "high"),
    }
  }, [safetyResult])

  const heroDataRange = coverage?.end
    ? ms.overviewDataRange.replace("{end}", coverage.end)
    : null

  const summaryGenerationInfo = useMemo(() => {
    return buildSummaryGenerationInfo({
      generation: result?.generation,
      locale,
      labelTemplate: ms.summaryGenerationProvenance,
      labelWithDurationTemplate: ms.summaryGenerationProvenanceWithDuration,
      labelWithFirstCardTemplate: ms.summaryGenerationProvenanceWithFirstCard,
      generatedAtLabel: ms.summaryGenerationDateTimeLabel,
      durationLabel: ms.summaryGenerationDurationLabel,
      firstCardLabel: ms.summaryGenerationFirstCardLabel,
      preGeneratedLabel: ms.summaryPreGeneratedLabel,
      preGeneratedTemplate: ms.summaryPreGeneratedProvenance,
    })
  }, [
    locale,
    ms.summaryGenerationDateTimeLabel,
    ms.summaryGenerationDurationLabel,
    ms.summaryGenerationFirstCardLabel,
    ms.summaryGenerationProvenance,
    ms.summaryGenerationProvenanceWithDuration,
    ms.summaryGenerationProvenanceWithFirstCard,
    ms.summaryPreGeneratedLabel,
    ms.summaryPreGeneratedProvenance,
    result,
  ])


  const renderSection = (
    moduleId: MedicalSummaryModuleId,
    title: string,
    content: React.ReactNode,
    /** The section's content is app-written and complete without its module
     *  (影像與病理重點 falls back to each report's own text), so a failed
     *  module still shows it. The failure itself stays in the banner. */
    options: { renderOnError?: boolean } = {},
  ) => {
    // A failed section is reported once, in the shared generation banner with
    // its retry and model-switch actions (identical errors consolidated) — a
    // per-section error box here would repeat the same failure.
    if (cardErrors[moduleId]) {
      return options.renderOnError && content
        ? <div key={moduleId} id={`medical-summary-section-${moduleId}`}>{content}</div>
        : null
    }
    if (modulePending(moduleId)) {
      return <SummarySectionPending key={moduleId} title={title} label={ms.generating} />
    }
    return <div key={moduleId} id={`medical-summary-section-${moduleId}`}>{content}</div>
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
          markUserTrigger('summary')
          const next = value as SummaryView
          setActiveView(next)
          if (next === "custom") {
            setCustomUnread(false)
            setSummarySettingsOpen(false)
          }
        }}
        className="gap-2"
      >
      <div className="flex flex-nowrap items-center gap-1.5 @max-[19rem]:flex-wrap">
        <ClipboardList className="h-4 w-4 shrink-0 text-teal-600 dark:text-primary @max-[32rem]:hidden" />
        <h2 className="shrink-0 text-base font-semibold text-foreground">{ms.title}</h2>
        <span className="shrink-0 rounded-md bg-teal-100 px-2 py-0.5 text-[0.6875rem] font-medium text-teal-700 dark:bg-primary/10 dark:text-primary @max-[32rem]:hidden">
          {ms.badge}
        </span>
        <TabsList className={`${SUBTAB_LIST_CLASSES} w-auto`}>
          <TabsTrigger
            value="standard"
            aria-label={ms.standardSummaryTab}
            className={`${SUBTAB_TRIGGER_CLASSES} min-w-[clamp(2.5rem,10cqw,3.5rem)] text-xs`}
          >
            {ms.standardSummaryTabShort}
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            data-tour="medical-summary-custom-tab"
            title={ms.customInsightsSubtitle}
            aria-label={ms.customSummaryTab}
            className={`${SUBTAB_TRIGGER_CLASSES} group min-w-[clamp(3rem,11cqw,4rem)] text-xs`}
          >
            <span>{ms.customSummaryTabShort}</span>
            {visibleInsightCount > 0 ? (
              <span className="text-[0.625rem] font-normal tabular-nums text-muted-foreground">
                {visibleInsightCount}
              </span>
            ) : null}
            {customGenerating && activeView !== "custom" ? (
              <Loader2 className="h-3 w-3 animate-spin text-violet-500 dark:text-primary" aria-label={ms.customGenerating} />
            ) : customUnread ? (
              <span
                className="h-2 w-2 rounded-full bg-primary"
                title={ms.customSummaryUnread}
                aria-label={ms.customSummaryUnread}
              />
            ) : null}
          </TabsTrigger>
        </TabsList>
        <div
          data-tour="medical-summary-controls"
          className="ml-auto flex min-w-0 basis-0 flex-1 flex-nowrap items-center justify-end gap-1.5 @max-[19rem]:!ml-0 @max-[19rem]:!basis-full @max-[19rem]:!flex-none"
        >
          {activeView === "standard" ? (
            <ModelPicker
              modelId={model}
              preserveSelection
              fallbackModelId={MEDICAL_SUMMARY_MODEL_ID}
              onSelect={setModel}
              open={summaryModelPickerOpen}
              onOpenChange={setSummaryModelPickerOpen}
              triggerRef={summaryModelPickerTriggerRef}
              tooltip={t.safetyAlerts.modelTooltip}
              compact
              triggerClassName="min-h-[44px] min-w-0 flex-1 basis-24 text-[clamp(12px,2cqw,15px)] shadow-none lg:min-h-8"
            />
          ) : (
            <ModelPicker
              modelId={insightsModel}
              fallbackModelId={MODEL_PREF_DEFAULTS.insights}
              onSelect={(id) => setModelFor("insights", id)}
              tooltip={t.modelPicker.insightsTooltip}
              align="end"
              compact
              triggerClassName="min-h-[44px] min-w-0 flex-1 basis-24 text-[clamp(12px,2cqw,15px)] shadow-none lg:min-h-8"
            />
          )}
          {activeView === "standard" && contextAdaptation ? (
            <InfoHint
              aria-label={ms.adaptedScopeLabel}
              side="bottom"
              className="h-7 shrink-0 gap-1 rounded-md border border-violet-300 bg-violet-50 px-1.5 text-violet-700 hover:bg-violet-100 hover:text-violet-900 dark:border-primary/30 dark:bg-primary/10 dark:text-primary dark:hover:bg-primary/15 dark:hover:text-primary"
              contentClassName="max-w-[min(90vw,24rem)] text-left leading-relaxed"
              label={(
                <span className="hidden text-[0.6875rem] font-medium @min-[44rem]:inline">
                  {ms.adaptedScopeLabel}
                </span>
              )}
            >
              {formatClinicalContextAdaptationNotice(contextAdaptation, locale)}
            </InfoHint>
          ) : null}
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
              className="hidden h-[44px] gap-1 px-2 text-xs shadow-none hover:shadow-none md:inline-flex lg:h-7"
              onClick={() => openCustomManager()}
              title={`${ms.manageCustomInsights}。${ms.customManagerDescription}`}
              aria-label={ms.manageCustomInsights}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden @min-[38rem]:inline">{ms.manageCustomInsights}</span>
            </Button>
          )}
          {activeView === "custom" && (
            <Button
              type="button"
              data-tour="custom-summary-help"
              variant="ghost"
              size="icon"
              className="hidden h-[44px] w-[44px] shrink-0 p-0 text-muted-foreground md:inline-flex lg:h-8 lg:w-8"
              title={locale === "en" ? "User guide" : "使用教學"}
              aria-label={locale === "en" ? "User guide" : "使用教學"}
              onClick={openCustomSummaryGuide}
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <Popover open={!tourActive && summarySettingsOpen} onOpenChange={setSummarySettingsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={summarySettingsOpen || dataScopeOpen ? "secondary" : "outline"}
                className="h-[44px] shrink-0 gap-1 px-2 text-xs shadow-none hover:shadow-none lg:h-7 @max-[36rem]:h-10 @max-[36rem]:w-10 @max-[36rem]:justify-center @max-[36rem]:px-0"
                title={ms.summaryControls}
                aria-label={ms.summaryControls}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="@max-[36rem]:hidden">{t.tabs.settings}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-1 p-2">
              {activeView === "standard" ? (
                <label
                  className="flex min-h-[44px] cursor-pointer select-text items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
                  title={ms.autoGenerateTooltip}
                >
                  <span className="font-medium text-foreground">{ms.autoGenerate}</span>
                  {/* A wrapping <label> does not name a button, and Radix renders the
                      switch as role="switch" on a <button> — without this the
                      control is announced with no name at all. */}
                  <Switch
                    checked={autoGenerate}
                    onCheckedChange={setAutoGenerate}
                    aria-label={ms.autoGenerate}
                    className="scale-90"
                  />
                </label>
              ) : null}
              <Button
                type="button"
                data-testid="medical-summary-data-scope-trigger"
                size="sm"
                variant="ghost"
                className="h-[44px] w-full justify-start gap-2 px-2 text-xs lg:h-8"
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
              {activeView === "custom" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-[44px] w-full justify-start gap-2 px-2 text-xs md:hidden"
                    onClick={() => {
                      setSummarySettingsOpen(false)
                      openCustomManager()
                    }}
                    title={ms.customManagerDescription}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    {ms.customManagerTitle}
                  </Button>
                  <Button
                    type="button"
                    data-tour="custom-summary-help"
                    variant="ghost"
                    size="sm"
                    className="min-h-[44px] w-full justify-start gap-2 px-2 text-xs md:hidden"
                    onClick={() => {
                      setSummarySettingsOpen(false)
                      openCustomSummaryGuide()
                    }}
                  >
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    {locale === "en" ? "Custom summaries guide" : "自訂摘要教學"}
                  </Button>
                </>
              ) : null}
              <div className="flex justify-end border-t pt-1">
                <AiDiagnosticsButton
                  hasRecords={visibleAiDiagnostics.length > 0}
                  availableLabel={ms.exportAiDiagnosticsTitle}
                  unavailableLabel={ms.exportAiDiagnosticsUnavailable}
                  onClick={() => {
                    setSummarySettingsOpen(false)
                    setDiagnosticsOpen(true)
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

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
              title={contextOverflowIssue
                ? ms.contextOverflowTitle
                : modelUnavailable
                  ? ms.modelUnavailableTitle
                  : ms.partialGenerationError}
              errors={displayedGenerationErrors}
              retryLabel={t.errors.retry}
              closeLabel={t.common.close}
              isBusy={generationActivity.actionBusy}
              onRetry={() => void retryFailed()}
              showRetry={!modelUnavailable}
              actions={contextOverflowIssue ? [
                {
                  label: ms.adjustDataScope,
                  onClick: () => setDataScopeOpen(true),
                  icon: <Database className="h-3 w-3" />,
                },
                ...(isCustomOpenAiModelId(model) ? [{
                  label: ms.contextWindowSettings,
                  onClick: () => setActiveTab(
                    "settings",
                    "ai",
                    {
                      kind: "openai-compatible-context-window",
                      profileId: openAiCompatibleProfileIdFromModelId(model) ?? undefined,
                    },
                  ),
                  icon: <Settings2 className="h-3 w-3" />,
                  variant: "outline" as const,
                }] : []),
              ] : [{
                label: t.modelPicker.switchModel,
                onClick: revealSummaryModelPicker,
              }]}
            />
          ) : null}

          <SummaryStatusStrip
            coverage={coverage}
            statsVisible={!isPatient}
            labels={{
              orgs: ms.coverageOrgs,
              encounters: ms.coverageEncounters,
              medications: ms.coverageMeds,
              labs: ms.coverageLabs,
            }}
            generationInfo={summaryGenerationInfo}
            activeGeneration={activeGeneration}
            runningLabel={ms.summaryGenerationRunningLabel}
            runningAriaTemplate={ms.summaryGenerationRunningProvenance}
          />

          {renderSection(
            "overview",
            ms.overviewTitle,
            result && moduleReady("overview") ? (
              <OverviewHeroCard
                result={result}
                title={ms.overviewTitle}
                dataRange={heroDataRange}
                mustKnowTitle={ms.mustKnowTitle}
                showMustKnow={!isPatient}
                highAlerts={isPatient ? [] : highAlerts}
                renderSafetySources={renderSafetySources}
                copyLabel={t.common.copy}
                copiedLabel={t.common.copied}
                copyFailedLabel={t.common.copyFailed}
                typeLabel={typeLabel}
                unverifiedLabel={ms.unverified}
                allergyRow={{
                  label: ms.allergyRowLabel,
                  noRecordText: ms.allergyRowNoRecord,
                  badgeLabel: ms.allergyRowBadge,
                  badgeHint: ms.allergyRowBadgeHint,
                  separator: ms.allergyRowSeparator,
                }}
                onNavigate={navigateToResource}
              />
            ) : null,
          )}

          {/* Patients get 用藥說明 where clinicians get 開藥前必看 — same module,
              different audience contract (see the overview prompt). */}
          {isPatient && result && moduleReady("overview") ? (
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
          ) : null}

          {renderSection(
            "focus",
            ms.focusTitle,
            result && moduleReady("focus") ? (
              <FocusCard
                result={result}
                title={ms.focusTitle}
                subtitle={ms.focusSubtitle}
                countLabel={ms.focusCount}
                verifyLabel={ms.verifyFlag}
                typeLabel={typeLabel}
                unverifiedLabel={ms.unverified}
                onNavigate={navigateToResource}
              />
            ) : null,
          )}

          {renderSection(
            "problems",
            ms.problemsTitle,
            result && moduleReady("problems") ? (
              <ProblemsCard
                result={result}
                title={ms.problemsTitle}
                subtitle={ms.problemsSubtitle}
                metaLabel={ms.problemsMeta}
                basisLabel={ms.problemBasisLabel}
                verifyLabel={ms.verifyFlag}
                legendLabel={ms.problemsLegend}
                showAllLabel={ms.problemsShowAll}
                showLessLabel={ms.showLessItems}
                typeLabel={typeLabel}
                unverifiedLabel={ms.unverified}
                sourceTypeMismatchLabel={ms.sourceTypeMismatch}
                onNavigate={navigateToResource}
              />
            ) : null,
          )}

          {/* 影像與病理重點 — clinician-facing. Rendered from the digest even when
              the reports module failed or never ran (legacy cache, demo), so
              only a run still in flight shows the placeholder. */}
          {!isPatient ? renderSection(
            "reports",
            ms.reportsTitle,
            result?.reportHighlights ? (
              <ReportHighlightsCard
                highlights={result.reportHighlights}
                labels={{
                  title: ms.reportsTitle,
                  subtitle: ms.reportsSubtitle,
                  kindLabels: ms.reportsKindLabels,
                  showMore: ms.reportsShowMore,
                  showLess: ms.reportsShowLess,
                  conclusionTag: ms.reportsConclusionTag,
                  openingTag: ms.reportsOpeningTag,
                  droppedQuotes: ms.reportsDroppedQuotes,
                  fallbackCount: ms.reportsFallbackCount,
                }}
                onNavigate={navigateToResource}
              />
            ) : null,
            { renderOnError: true },
          ) : null}

          {renderSection(
            "recent",
            ms.recentTitle,
            result && moduleReady("recent") ? (
              <RecentEventsCard
                result={result}
                title={ms.recentTitle}
                subtitle={ms.recentSubtitle}
                encounterClassLabel={encounterClassLabel}
                earlierLabel={ms.recentShowEarlier}
                collapseLabel={ms.recentShowLess}
                droppedNote={
                  result.droppedRecentCount > 0
                    ? ms.recentDropped.replace("{count}", String(result.droppedRecentCount))
                    : null
                }
                onNavigate={navigateToResource}
              />
            ) : null,
          )}

          {isSafetyGenerating && !safetyResult ? (
            <SummarySectionPending title={ms.otherAlertsSectionLabel} label={safetyText.scanning} />
          ) : (
            <OtherAlertsDisclosure
              alerts={otherAlerts}
              title={ms.otherAlerts}
              disclaimer={safetyText.disclaimer}
              renderSources={renderSafetySources}
            />
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
              statsVisible={false}
            />
          ) : null}

          <div className="flex flex-col items-center gap-0.5 px-1 pb-0.5">
            <p className="text-center text-[0.65rem] leading-snug text-muted-foreground/60">
              {ms.secondLayerNote}
            </p>
          </div>

          {!hasAnyResult && displayedGenerationErrors.length === 0 ? (
            <div className="flex min-h-[clamp(18rem,45vh,32rem)] items-center justify-center px-4 py-12">
              <SummaryGenerationButton
                presentation="empty"
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
            </div>
          ) : null}
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
        floorNote={ms.dataScopeFloorNote}
        modelId={activeView === "standard" ? model : insightsModel}
        fallbackModelId={activeView === "standard" ? MEDICAL_SUMMARY_MODEL_ID : MODEL_PREF_DEFAULTS.insights}
        overflowIssue={activeView === "standard" ? overflowGuidance : null}
      />
      <CustomInsightModulesManagerDrawer
        open={tourActive ? tourEditorOpen : customManagerOpen}
        onOpenChange={setCustomManagerOpen}
        initialPanelId={tourActive ? visibleInsightPanels[0]?.id ?? insightPanels[0]?.id : selectedCustomPanelId}
        guidedPreview={tourActive}
        tourStep={tourActive ? tourStep : null}
      />
      <AiExecutionDiagnosticsDialog
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
        records={visibleAiDiagnostics}
        labels={t.aiDiagnostics}
        onDownloadAll={exportAiDiagnostics}
        onDownloadRecord={exportOneAiDiagnostic}
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
                {isCustomOpenAiModelId(model)
                  ? ms.contextOverflowResolveDescription
                  : ms.contextOverflowResolveCloudDescription}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            {isCustomOpenAiModelId(model) ? (
              <AlertDialogAction
                className="border border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setOverflowResolutionOpen(false)
                  setActiveTab("settings", "ai", {
                    kind: "openai-compatible-context-window",
                    profileId: openAiCompatibleProfileIdFromModelId(model) ?? undefined,
                  })
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
