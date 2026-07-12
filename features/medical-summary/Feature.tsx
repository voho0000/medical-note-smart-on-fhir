// Medical Summary (醫療摘要) — one feature with two reading modes:
// structured standard summary and independently generated custom summaries.
// Structured AI output (Zod-validated) renders as fixed cards — never a
// free-text markdown blob. Pluggable via right-panel-registry (enabled flag).
"use client"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertCircle, ClipboardList, LayoutList, Loader2, RefreshCw, Settings2, Sparkles } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
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
import { CurrentPrioritiesCard } from "./components/CurrentPrioritiesCard"
import { InvestigationTrendsCard } from "./components/InvestigationTrendsCard"
import { MedicationEducationCard } from "./components/MedicationEducationCard"
import { MedicationReconciliationCard } from "./components/MedicationReconciliationCard"
import { CareRemindersSafetyCard } from "./components/CareRemindersSafetyCard"
import { ProblemListCard } from "./components/ProblemListCard"
import { CrossFacilityTimeline } from "./components/CrossFacilityTimeline"
import { CoverageCard } from "./components/CoverageCard"
import { SourceSup } from "./components/SourceSup"
import { CustomInsightModulesSection } from "./components/CustomInsightModulesSection"
import { CustomInsightModulesManagerDrawer } from "./components/CustomInsightModulesManagerDrawer"
import {
  MedicalSummaryCardLayoutManager,
  type MedicalSummaryCardLayoutItem,
} from "./components/MedicalSummaryCardLayoutManager"
import {
  useMedicalSummaryCardLayout,
  type MedicalSummaryCardId,
} from "./hooks/useMedicalSummaryCardLayout"
import { useClinicalInsightsRuntime } from "@/features/clinical-insights/ClinicalInsightsRuntimeProvider"
import { MAX_SUMMARY_INSIGHT_MODULES } from "@/src/shared/constants/clinical-insights.constants"
import type {
  EncounterClass,
  InvestigationDirection,
  InvestigationKind,
  MedicationChangeType,
  ProblemKind,
  ResolvedSourceRef,
  TimelineCategory,
} from "@/src/core/entities/medical-summary.entity"

type SummaryView = "standard" | "custom"

export default function MedicalSummaryFeature() {
  const { t } = useLanguage()
  const { audience } = useAudience()
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
    retryFailed,
    isGenerating: isBusy,
    isRestoring,
    summaryError,
    safetyError,
    hasAnyResult,
    hasCompleteResult,
    resolveSafetySource,
  } = useMedicalSummaryOrchestrator()

  const safetyText = useMemo(
    () => (isPatient ? { ...t.safetyAlerts, ...t.safetyAlerts.patient } : t.safetyAlerts),
    [isPatient, t.safetyAlerts],
  )
  const generationErrors = useMemo(() => [
    summaryError ? {
      label: ms.prioritiesTitle,
      message: summaryError === "PARSE_FAILED" ? ms.parseError : summaryError,
    } : null,
    safetyError ? {
      label: ms.careSafetyTitle,
      message: safetyError === "PARSE_FAILED" ? safetyText.parseError : safetyError,
    } : null,
  ].filter((item): item is { label: string; message: string } => item !== null), [ms, safetyError, safetyText.parseError, summaryError])

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
          toast.info(navFallbackMsg.replace("{label}", what || target.resourceType))
        }
      }, NAV_CLAIM_TIMEOUT_MS)
    },
    [navFallbackMsg],
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
  const investigationsRef = useRef<HTMLDivElement>(null)
  const safetyRef = useRef<HTMLDivElement>(null)
  const medicationsRef = useRef<HTMLDivElement>(null)
  const problemsRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const showSafetyCard = Boolean(safetyResult || (!safetyError && result))
  const availableCardIds = useMemo<MedicalSummaryCardId[]>(() => {
    const ids: MedicalSummaryCardId[] = []
    if (result) ids.push("problems")
    if (result?.timeline.length) ids.push("timeline")
    if (showSafetyCard) ids.push("safety")
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

  const summaryCards: Partial<Record<MedicalSummaryCardId, ReactNode>> = {
    problems: result ? (
      <div ref={problemsRef} className="scroll-mt-2">
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
      <div ref={timelineRef} className="scroll-mt-2">
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
      <div ref={safetyRef} className="scroll-mt-2">
        <CareRemindersSafetyCard
          result={safetyResult}
          isScanning={false}
          error={null}
          hasPatient={hasPatient}
          renderSources={renderSafetySources}
          title={ms.careSafetyTitle}
        />
      </div>
    ) : null,
    investigations: result ? (
      <div ref={investigationsRef} className="scroll-mt-2">
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
          onNavigate={navigateToResource}
        />
      </div>
    ) : null,
    medications: result ? (
      <div ref={medicationsRef} className="scroll-mt-2">
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
      <div className="flex flex-wrap items-center gap-1.5">
        <ClipboardList className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
        <h2 className="text-base font-semibold text-foreground">{ms.title}</h2>
        <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[0.6875rem] font-medium text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
          {ms.badge}
        </span>
        <TabsList className="h-7 w-auto rounded-lg p-0.5 shadow-none">
          <TabsTrigger value="standard" className="min-w-20 rounded-md px-2.5 py-0.5 text-xs">
            {ms.standardSummaryTab}
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            title={ms.customInsightsSubtitle}
            className="relative min-w-20 rounded-md px-2.5 py-0.5 text-xs"
          >
            <span>{ms.customSummaryTab}</span>
            {visibleInsightCount > 0 ? (
              <span className="rounded-full bg-muted px-1.5 py-0 text-[0.625rem] tabular-nums text-muted-foreground">
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
        {activeView === "standard" ? (
        <div className="ml-auto flex items-center gap-1.5">
          <ModelPicker
            modelId={model}
            fallbackModelId={MEDICAL_SUMMARY_MODEL_ID}
            onSelect={setModel}
            tooltip={t.safetyAlerts.modelTooltip}
            compact
          />
          {hasPatient && dataReady ? (
            <Button onClick={() => void generate()} size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-xs" disabled={isBusy || isRestoring}>
              {isBusy ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : hasAnyResult ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {hasAnyResult ? ms.regenerate : ms.generate}
            </Button>
          ) : null}
          <Popover open={summarySettingsOpen} onOpenChange={setSummarySettingsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant={summarySettingsOpen ? "secondary" : "ghost"}
                className="h-7 w-7 text-muted-foreground"
                title={ms.summaryControls}
                aria-label={ms.summaryControls}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-1 p-2">
              <label
                className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60"
                title={ms.autoGenerateTooltip}
              >
                <span className="font-medium text-foreground">{ms.autoGenerate}</span>
                <Switch checked={autoGenerate} onCheckedChange={setAutoGenerate} className="scale-90" />
              </label>
              {availableCardIds.length > 0 ? (
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
        ) : (
          <div className="ml-auto flex items-center gap-1.5">
            <ModelPicker
              modelId={insightsModel}
              fallbackModelId={MODEL_PREF_DEFAULTS.insights}
              onSelect={(id) => setModelFor("insights", id)}
              tooltip={t.modelPicker.insightsTooltip}
              align="end"
              compact
            />
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
          </div>
        )}
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
      ) : isBusy && !hasCompleteResult ? (
        <div className="rounded-xl border border-border bg-card px-3 py-8">
          <div className="flex flex-col items-center gap-2">
            <StreamingIndicator label={ms.generating} />
            <p className="text-xs text-muted-foreground/70">{ms.generatingHint}</p>
          </div>
        </div>
      ) : (
        <>
          {generationErrors.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{ms.partialGenerationError}</p>
                {generationErrors.map((item) => (
                  <p key={item.label} className="mt-0.5 text-xs">
                    <span className="font-medium">{item.label}：</span>{item.message}
                  </p>
                ))}
              </div>
              {!isBusy ? (
                <Button onClick={() => void retryFailed()} size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-xs">
                  <RefreshCw className="h-3 w-3" />
                  {t.errors.retry}
                </Button>
              ) : null}
            </div>
          ) : null}

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
              updating={false}
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
      <CustomInsightModulesManagerDrawer
        open={customManagerOpen}
        onOpenChange={setCustomManagerOpen}
        initialPanelId={selectedCustomPanelId}
      />
    </div>
  )
}
