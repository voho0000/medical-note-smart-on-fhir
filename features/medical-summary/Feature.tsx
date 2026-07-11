// Medical Summary (醫療摘要) — zero-click, single vertical flow: narrative →
// disease-oriented test trends → safety alerts → decisions → cross-facility timeline → coverage. Reading
// needs no interaction; auditing (source chips, evidence) is always visible.
// Structured AI output (Zod-validated) renders as fixed cards — never a
// free-text markdown blob. Pluggable via right-panel-registry (enabled flag).
"use client"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ClipboardList, RefreshCw, Sparkles, AlertCircle } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { StreamingIndicator } from "@/src/shared/components/StreamingIndicator"
import { useMedicalSummary } from "@/src/application/hooks/medical-summary/use-medical-summary.hook"
import {
  useResourceNavigationStore,
  NAV_CLAIM_TIMEOUT_MS,
  type ResourceNavTarget,
} from "@/src/application/stores/resource-navigation.store"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"
import { SafetyAlertsPanel } from "@/features/proactive-safety-alerts/SafetyAlertsPanel"
import { ModelPicker } from "@/src/shared/components/ModelPicker"
import { MEDICAL_SUMMARY_MODEL_ID } from "@/src/core/use-cases/medical-summary/generate-medical-summary.use-case"
import { useSafetyAlerts } from "@/src/application/hooks/safety-alerts/use-safety-alerts.hook"
import { countBySeverity } from "@/src/core/entities/safety-alert.entity"
import { SummaryNarrativeCard } from "./components/SummaryNarrativeCard"
import { InvestigationTrendsCard } from "./components/InvestigationTrendsCard"
import { SummarySectionNav, type SummarySection } from "./components/SummarySectionNav"
import { ProblemListCard } from "./components/ProblemListCard"
import { DecisionList } from "./components/DecisionList"
import { CrossFacilityTimeline } from "./components/CrossFacilityTimeline"
import { CoverageCard } from "./components/CoverageCard"
import { SourceSup } from "./components/SourceSup"
import type {
  EncounterClass,
  InvestigationDirection,
  InvestigationKind,
  ProblemKind,
  ResolvedSourceRef,
  SummaryUrgency,
  TimelineCategory,
} from "@/src/core/entities/medical-summary.entity"

export default function MedicalSummaryFeature() {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const base = t.medicalSummary
  const isPatient = audience === "patient"
  // Patient keys override the clinician base set (same pattern as safety).
  const ms = isPatient ? { ...base, ...base.patient } : base

  const {
    result,
    coverage,
    isGenerating,
    error,
    hasPatient,
    dataReady,
    autoGenerate,
    setAutoGenerate,
    model,
    setModel,
    generate,
  } = useMedicalSummary()

  // The whole tab is ONE briefing assembled from two independent AI calls
  // (summary + safety). This is the ONLY useSafetyAlerts instance — the
  // embedded panel is presentational — so its auto-scan effect fires once.
  // The tab's single set of controls below drives BOTH.
  const {
    result: safetyResult,
    isScanning,
    error: safetyError,
    setAutoScan,
    model: safetyModel,
    setModel: setSafetyModel,
    scan,
    resolveSource: resolveSafetySource,
  } = useSafetyAlerts()

  // Unified controls — one picker / toggle / button governs both calls.
  const setModelBoth = useCallback(
    (id: string) => {
      setModel(id)
      setSafetyModel(id)
    },
    [setModel, setSafetyModel],
  )
  const setAutoBoth = useCallback(
    (value: boolean) => {
      setAutoGenerate(value)
      setAutoScan(value)
    },
    [setAutoGenerate, setAutoScan],
  )
  const runBoth = useCallback(() => {
    void generate()
    void scan()
  }, [generate, scan])
  // Combined busy/has-output state for the single button.
  const isBusy = isGenerating || isScanning
  const hasAnyResult = !!result || !!safetyResult
  // The two model prefs persisted separately BEFORE the controls were unified,
  // so historical values can diverge — the picker would show the summary's
  // model while the scan silently ran on another. One-way sync: summary's
  // pref is the source of truth. setSafetyModel also invalidates the safety
  // cache, which is correct — a result from a different model is stale.
  useEffect(() => {
    if (safetyModel !== model) setSafetyModel(model)
  }, [safetyModel, model, setSafetyModel])

  // Clinicians see raw FHIR resource types on chips; patients get plain words.
  const typeLabel = (resourceType?: string): string => {
    if (!resourceType) return ""
    if (!isPatient) return resourceType
    return (base.patient.sourceTypes as Record<string, string>)[resourceType] ?? resourceType
  }
  const urgencyLabel = (u: SummaryUrgency) =>
    u === "high" ? ms.urgencyHigh : u === "medium" ? ms.urgencyMedium : ms.urgencyLow
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
    (keys: string[]) => {
      if (!keys?.length) return null
      const refs: ResolvedSourceRef[] = keys.map((key, i) => {
        const e = resolveSafetySource(key)
        return {
          key,
          num: i + 1,
          verified: !!e,
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

  // Section jump-bar: severity counts from the safety result we already own;
  // decisions/timeline from the summary result. Refs let a chip smooth-scroll
  // to its section on this (possibly long) page.
  const safetyCounts = useMemo(() => {
    if (!safetyResult) return null
    const c = countBySeverity(safetyResult.alerts)
    return { ...c, total: safetyResult.alerts.length }
  }, [safetyResult])
  const problemsRef = useRef<HTMLDivElement>(null)
  const investigationsRef = useRef<HTMLDivElement>(null)
  const safetyRef = useRef<HTMLDivElement>(null)
  const decisionsRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const jumpTo = useCallback((section: SummarySection) => {
    const el = (
      section === "problems"
        ? problemsRef
        : section === "investigations"
          ? investigationsRef
        : section === "safety"
          ? safetyRef
          : section === "decisions"
            ? decisionsRef
            : timelineRef
    ).current
    if (!el) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  }, [])

  return (
    // @container drives the responsive split off the PANEL's own width, not the
    // viewport — the right panel is ~700px in a split view but ~1900px once the
    // left panel collapses, and only container queries see that. Capped so the
    // two columns never exceed a readable line length on ultrawide screens.
    <div className="@container mx-auto max-w-[84rem] space-y-3 py-1">
      {/* Header: title + controls. No maximize — the page IS the content. */}
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
        <h2 className="text-base font-semibold text-foreground">{ms.title}</h2>
        <span className="rounded-md bg-teal-100 dark:bg-teal-950/60 px-2 py-0.5 text-[0.6875rem] font-medium text-teal-700 dark:text-teal-300">
          {ms.badge}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {/* ONE set of controls for the whole tab — each drives BOTH the
              summary generation and the safety scan. */}
          <ModelPicker
            modelId={model}
            fallbackModelId={MEDICAL_SUMMARY_MODEL_ID}
            onSelect={setModelBoth}
            tooltip={t.safetyAlerts.modelTooltip}
          />
          <label
            className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap"
            title={ms.autoGenerateTooltip}
          >
            <Switch checked={autoGenerate} onCheckedChange={setAutoBoth} className="scale-90" />
            {ms.autoGenerate}
          </label>
          {hasPatient && dataReady ? (
            // Stays mounted while busy (disabled, spinning icon, SAME label) —
            // unmounting it shifted the picker/switch rightward on every
            // regenerate click.
            <Button onClick={runBoth} size="sm" variant="outline" className="gap-1.5" disabled={isBusy}>
              {isBusy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : hasAnyResult ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {hasAnyResult ? ms.regenerate : ms.generate}
            </Button>
          ) : null}
        </div>
      </div>

      {!hasPatient ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{ms.emptyNoPatient}</div>
      ) : !dataReady ? (
        <div className="py-10 flex justify-center">
          <StreamingIndicator label={ms.loadingData} />
        </div>
      ) : (
        <>
          {error ? (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{error === "PARSE_FAILED" ? ms.parseError : error}</span>
              {/* Retries ONLY the summary call — the safety scan may have
                  succeeded, and re-running it would re-bill for nothing. */}
              {!isGenerating ? (
                <Button onClick={() => void generate()} size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-xs">
                  <RefreshCw className="h-3 w-3" />
                  {t.errors.retry}
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Section jump-bar — full width above the split; counts at a
              glance + scroll accelerator. */}
          {result ? (
            <SummarySectionNav
              safety={safetyCounts}
              problems={result.problems?.length ?? 0}
              investigations={result.investigations?.length ?? 0}
              decisions={result.decisions.length}
              timeline={result.timeline.length}
              onJump={jumpTo}
              labels={{
                safety: ms.navSafety,
                problems: ms.navProblems,
                investigations: ms.navInvestigations,
                decisions: ms.navDecisions,
                timeline: ms.navTimeline,
                high: ms.urgencyHigh,
                medium: ms.urgencyMedium,
                low: ms.urgencyLow,
              }}
            />
          ) : null}

          {/* Newspaper split at container ≥52rem, single column below. The
              column contents are ordered so that when they FLATTEN into one
              column (below 52rem) the sequence is the intended reading order:
              narrative → investigations → safety → problems → decisions → timeline. Left =
              narrative + tests + safety (the assessment: who is this, what's changing, what's dangerous);
              right = problems → decisions → timeline (conditions, act, history).
              items-start lets each column flow to its own height. */}
          <div className="grid grid-cols-1 items-start gap-3 @min-[52rem]:grid-cols-2">
            {/* LEFT — assessment: narrative → investigations → safety */}
            <div className="min-w-0 space-y-3">
              {result ? (
                <SummaryNarrativeCard
                  result={result}
                  title={ms.narrativeTitle}
                  generatedByLine={generatedByLine}
                  typeLabel={typeLabel}
                  unverifiedLabel={ms.unverified}
                  onNavigate={navigateToResource}
                  updating={isGenerating}
                />
              ) : isGenerating ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground">
                    {ms.narrativeTitle}
                  </h3>
                  <div className="py-6 flex flex-col items-center gap-2">
                    <StreamingIndicator label={ms.generating} />
                    <p className="text-xs text-muted-foreground/70">{ms.generatingHint}</p>
                  </div>
                </div>
              ) : null}
              {result ? (
                <div ref={investigationsRef} className="scroll-mt-2">
                  <InvestigationTrendsCard
                    result={result}
                    title={ms.investigationsTitle}
                    subtitle={ms.investigationsSubtitle}
                    kindLabel={investigationKindLabel}
                    directionLabel={investigationDirectionLabel}
                    typeLabel={typeLabel}
                    unverifiedLabel={ms.unverified}
                    onNavigate={navigateToResource}
                  />
                </div>
              ) : null}
              {/* Idle (no result, not generating) renders nothing — the header's
                  產生摘要 button is the whole call-to-action. */}
              {/* Safety alerts — presentational; the tab's controls drive its
                  scan. Renders independently (own loading/error/cache). */}
              <div ref={safetyRef} className="scroll-mt-2 rounded-xl border border-border bg-card p-4">
                <SafetyAlertsPanel
                  result={safetyResult}
                  isScanning={isScanning}
                  error={safetyError}
                  hasPatient={hasPatient}
                  renderSources={renderSafetySources}
                  onRetry={() => void scan()}
                  retryLabel={t.errors.retry}
                />
              </div>
            </div>

            {/* RIGHT — conditions, act, history: problems → decisions → timeline */}
            <div className="min-w-0 space-y-3">
              {result ? (
                <>
                  <div ref={problemsRef} className="scroll-mt-2">
                    <ProblemListCard
                      result={result}
                      title={ms.problemsTitle}
                      basisLabel={ms.problemBasisLabel}
                      badgeLabel={problemBadgeLabel}
                      typeLabel={typeLabel}
                      unverifiedLabel={ms.unverified}
                      onNavigate={navigateToResource}
                    />
                  </div>
                  <div ref={decisionsRef} className="scroll-mt-2">
                    <DecisionList
                      result={result}
                      title={ms.decisionsTitle}
                      urgencyLabel={urgencyLabel}
                      basisLabel={ms.basisLabel}
                      aiInferredLabel={ms.aiInferred}
                      showUrgency={!isPatient}
                      typeLabel={typeLabel}
                      unverifiedLabel={ms.unverified}
                      onNavigate={navigateToResource}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Timeline — full width BELOW the split: each event is a horizontal
              strip (date · class tag · hospital · label) that wraps into 2–3
              lines at half width, so it benefits from span more than any other
              card. Reading order keeps it last either way. */}
          {result ? (
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
          ) : null}

          {/* 5. Coverage — deterministic, always visible once data is loaded */}
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

          <p className="pb-1 text-center text-[0.6875rem] leading-relaxed text-muted-foreground/60">
            {ms.secondLayerNote}
          </p>
        </>
      )}
    </div>
  )
}
