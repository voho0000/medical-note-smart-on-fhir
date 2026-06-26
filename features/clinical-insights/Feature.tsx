// Refactored Clinical Insights Feature
"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { TAB_ACTIVE_CLASSES, CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"

import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useAllApiKeys, useModel } from "@/src/application/stores/ai-config.store"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useClinicalInsightsConfig } from "@/src/application/providers/clinical-insights-config.provider"
import { hasChatProxy } from "@/src/shared/config/env.config"
import {
  saveEncryptedCache,
  loadEncryptedCache,
  removeEncryptedCache,
  aiResultCacheKey,
  contentSignature,
} from "@/src/infrastructure/cache/encrypted-session-cache"

import { useInsightPanels } from './hooks/useInsightPanels'
import { useInsightGeneration } from './hooks/useInsightGeneration'
import { useInsightResponsesStore } from './hooks/useInsightResponsesStore'
import { useAutoGenerate } from './hooks/useAutoGenerate'
import { InsightPanel } from './components/InsightPanel'
import { ApiKeyWarning } from './components/ApiKeyWarning'
import { TabManagementToolbar } from './components/TabManagementToolbar'
import { SafetyAlertsPanel } from '@/features/proactive-safety-alerts/SafetyAlertsPanel'
import { ShieldAlert, Maximize2, Minimize2 } from 'lucide-react'
import type { ResponseEntry } from './types'

// A fixed, LOCKED tab living alongside the user's editable insight tabs:
// no prompt editing, fixed structured output + UI (its own scan + cards).
const SAFETY_TAB_ID = '__safety-alerts__'

// Cached insight responses share the bundle's 12h lifecycle (encrypted, session-
// scoped) so a refresh reuses them but they never outlive the chart.
const INSIGHTS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000

export default function ClinicalInsightsFeature() {
  const { t } = useLanguage()
  const { audience } = useAudience()
  // Patient audience sees the friendlier "健康提醒" labels for the locked tab.
  const safetyTabLabel = audience === 'patient' ? t.safetyAlerts.patient.tabLabel : t.tabs.safetyAlerts
  const safetyTabTitle = audience === 'patient' ? t.safetyAlerts.patient.title : t.safetyAlerts.title
  // Maximize the panel into a fullscreen overlay (same pattern as the chat panel).
  const [isExpanded, setIsExpanded] = useState(false)
  const { panels: configPanels, updatePanelAndSave } = useClinicalInsightsConfig()
  const { apiKey: openAiKey, geminiKey } = useAllApiKeys()
  const { getFullClinicalContext } = useClinicalContext('insights')
  const { isLoading: clinicalDataLoading, error: clinicalDataError } = useClinicalData()
  // usePatient (not useFhirContext) so the id is present for LOCAL/demo bundles
  // too — it keys both the per-patient reset and the response cache.
  const { patient } = usePatient()
  const patientId = patient?.id ?? ''
  const model = useModel()

  const [context, setContext] = useState("")
  const [activeTabId, setActiveTabId] = useState<string>("")
  // Regenerate nukes manual edits — when the response is edited, hold the
  // request here until the user confirms
  const [pendingRegenerateId, setPendingRegenerateId] = useState<string | null>(null)
  
  const panels = configPanels

  // Prompts management (temporary local state, not saved)
  const { prompts, handlePromptChange } = useInsightPanels(panels)

  const canUseProxy = hasChatProxy
  const canGenerate = Boolean(openAiKey || geminiKey) || canUseProxy

  const resetForPatient = useInsightResponsesStore((s) => s.resetForPatient)

  // Single Source of Truth: All state owned by useInsightGeneration
  const { runPanel, stopPanel, responses, panelStatus, setResponses } = useInsightGeneration({
    panels,
    prompts,
    context,
    model,
  })

  // Response management functions (operate on SSOT)
  const handleResponseChange = useCallback((panelId: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [panelId]: { 
        text: value, 
        isEdited: true, 
        metadata: value === "" ? null : (prev[panelId]?.metadata ?? null)
      },
    }))
  }, [setResponses])

  const clearResponse = useCallback((panelId: string) => {
    setResponses((prev) => ({
      ...prev,
      [panelId]: { text: "", isEdited: false, metadata: null },
    }))
  }, [setResponses])

  // Clear responses only when the PATIENT actually changes (new bundle) — NOT on
  // every remount, otherwise output would be wiped each time the user leaves and
  // returns to this tab. The store tracks the owning patient id.
  useEffect(() => {
    resetForPatient(patientId)
  }, [patientId, resetForPatient])

  // Update context when it changes (without resetting responses)
  useEffect(() => {
    const latestContext = getFullClinicalContext()
    setContext(latestContext)
  }, [getFullClinicalContext])

  // Per-panel cache key: a response is reusable only for the SAME prompt, so we
  // tag each cached entry with the prompt's signature.
  const promptSig = useCallback(
    (panelId: string) => contentSignature(prompts[panelId] ?? panels.find((p) => p.id === panelId)?.prompt ?? ''),
    [prompts, panels],
  )

  // Restore cached responses on (re)load so a refresh on the same patient + same
  // template keeps the output instead of regenerating. Only entries whose prompt
  // signature still matches are restored; a changed template falls through to
  // auto-generate. `hydratedPatient` gates auto-generate so it can't race the
  // restore and re-bill.
  //
  // Deps are kept STABLE (`patientId` + a `panelsReady` boolean) so the async
  // load isn't cancelled by spurious re-renders while panels/prompts settle —
  // panels + the signature fn are read through refs at restore time instead.
  const panelsRef = useRef(panels)
  panelsRef.current = panels
  const promptSigRef = useRef(promptSig)
  promptSigRef.current = promptSig
  const panelsReady = panels.length > 0
  const [hydratedPatient, setHydratedPatient] = useState<string | null>(null)
  useEffect(() => {
    if (!patientId || !panelsReady) return
    const store = useInsightResponsesStore.getState()
    if (store.ownerPatientId === patientId && Object.keys(store.responses).length > 0) {
      setHydratedPatient(patientId)
      return
    }
    let cancelled = false
    void loadEncryptedCache<{ entries: Record<string, ResponseEntry & { promptSig: string }> }>(
      aiResultCacheKey('insights', patientId),
      INSIGHTS_CACHE_MAX_AGE_MS,
    ).then((cached) => {
      if (cancelled) return
      const curPanels = panelsRef.current
      const sig = promptSigRef.current
      const restored: Record<string, ResponseEntry> = {}
      for (const [pid, entry] of Object.entries(cached?.entries ?? {})) {
        if (!curPanels.some((p) => p.id === pid)) continue
        if (entry.promptSig !== sig(pid)) continue
        restored[pid] = { text: entry.text, isEdited: entry.isEdited, metadata: entry.metadata }
      }
      if (Object.keys(restored).length) {
        resetForPatient(patientId)
        setResponses((prev) => ({ ...restored, ...prev }))
      }
      setHydratedPatient(patientId)
    })
    return () => { cancelled = true }
  }, [patientId, panelsReady, resetForPatient, setResponses])

  // Persist completed responses (once all panels are idle) so they survive a
  // reload. Skips while any panel streams; clears the cache when nothing is left.
  useEffect(() => {
    if (!patientId || hydratedPatient !== patientId) return
    if (panels.some((p) => panelStatus[p.id]?.isLoading)) return
    const entries: Record<string, ResponseEntry & { promptSig: string }> = {}
    for (const panel of panels) {
      const r = responses[panel.id]
      if (r?.text?.trim() && !panelStatus[panel.id]?.error) {
        entries[panel.id] = { text: r.text, isEdited: r.isEdited, metadata: r.metadata ?? null, promptSig: promptSig(panel.id) }
      }
    }
    const key = aiResultCacheKey('insights', patientId)
    if (Object.keys(entries).length) void saveEncryptedCache(key, { entries })
    else removeEncryptedCache(key)
  }, [responses, panelStatus, patientId, hydratedPatient, panels, promptSig])

  useAutoGenerate({
    panels,
    canGenerate: canGenerate && hydratedPatient === patientId,
    context,
    runPanel,
    responses,
  })

  // Safety Alerts is the pinned, locked FIRST tab and the default selection.
  useEffect(() => {
    if (!activeTabId) {
      setActiveTabId(SAFETY_TAB_ID)
    } else if (activeTabId !== SAFETY_TAB_ID && !panels.find(p => p.id === activeTabId)) {
      // active editable tab was deleted → fall back to Safety
      setActiveTabId(SAFETY_TAB_ID)
    }
  }, [panels, activeTabId])

  // Only enable insights when data is fully loaded and context is available
  const hasData = !clinicalDataLoading && !clinicalDataError && context.trim().length > 0

  const panelEntries = useMemo(() => {
    return panels.map((panel) => {
      const responseEntry = responses[panel.id] ?? { text: "", isEdited: false }
      const status = panelStatus[panel.id] ?? { isLoading: false, error: null }

      return {
        id: panel.id,
        label: panel.title,
        props: {
          panelId: panel.id,
          title: panel.title,
          prompt: prompts[panel.id] ?? panel.prompt,
          onPromptChange: (value: string) => handlePromptChange(panel.id, value),
          onRegenerate: () => {
            if (responseEntry.isEdited) setPendingRegenerateId(panel.id)
            else runPanel(panel.id, { force: true })
          },
          onStopGeneration: () => stopPanel(panel.id),
          isLoading: status.isLoading,
          response: responseEntry.text,
          error: status.error,
          canGenerate,
          hasData,
          onResponseChange: (value: string) => handleResponseChange(panel.id, value),
          onClearResponse: () => clearResponse(panel.id),
          isEdited: responseEntry.isEdited,
          modelMetadata: responseEntry.metadata ?? null,
          fallbackModelId: model,
          autoGenerate: panel.autoGenerate ?? false,
          onToggleAutoGenerate: (value: boolean) =>
            updatePanelAndSave(panel.id, { autoGenerate: value }),
        },
      }
    })
  }, [canGenerate, hasData, handlePromptChange, handleResponseChange, clearResponse, model, panelStatus, panels, prompts, responses, runPanel, stopPanel, updatePanelAndSave])

  // If FHIR data failed to load, show error and disable the feature
  if (clinicalDataError) {
    return (
      <ScrollArea className="h-full pr-3">
        <div className="space-y-4">
          <Card className={`gap-2 py-4 border-destructive ${CARD_BORDER_CLASSES.insight}`}>
            <CardContent>
              <div className="text-sm">
                <div className="font-medium text-destructive mb-2">{t.clinicalInsights.fhirDataRequired}</div>
                <div className="text-muted-foreground mb-3">{t.clinicalInsights.fhirDataRequiredDesc}</div>
                <div className="text-destructive">
                  <div className="font-medium mb-1">{t.common.error}:</div>
                  <div>{clinicalDataError instanceof Error ? clinicalDataError.message : t.errors.fetchClinicalData}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    )
  }


  return (
    <div className={isExpanded ? "fixed inset-0 z-50 flex flex-col bg-background/95 p-3 backdrop-blur-sm sm:p-6" : "h-full"}>
      {isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          title={t.common.minimize}
          aria-label={t.common.minimize}
          className="absolute right-3 top-3 z-10 rounded-full bg-muted/80 p-2 text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground"
        >
          <Minimize2 className="h-5 w-5" />
        </button>
      )}
      <ScrollArea className={isExpanded ? "mx-auto h-full w-full max-w-5xl" : "h-full pr-3"}>
      <div className="space-y-4">
        {!canGenerate && <ApiKeyWarning />}
        {/* Safety Alerts is always present (locked first tab), so the tab block
            always renders — even if the user deletes all editable insight tabs. */}
        {(
          <>
            <Tabs value={activeTabId} onValueChange={setActiveTabId} className="space-y-4">
            <div className="flex items-center gap-2">
              <TabsList className="grid flex-1 gap-1 h-9 bg-muted/40 p-1 border border-border/50 rounded-md" style={{ gridTemplateColumns: `repeat(${panelEntries.length + 1}, minmax(0, 1fr))` }}>
                {/* Locked safety-alerts tab — pinned FIRST, fixed prompt + fixed UI */}
                <TabsTrigger
                  value={SAFETY_TAB_ID}
                  title={safetyTabTitle}
                  className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.insight} min-w-0 flex items-center justify-center gap-1`}
                >
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{safetyTabLabel}</span>
                </TabsTrigger>
                {panelEntries.map((panel) => (
                  <TabsTrigger
                    key={panel.id}
                    value={panel.id}
                    className={`text-sm rounded-sm overflow-hidden ${TAB_ACTIVE_CLASSES.insight} min-w-0`}
                  >
                    <span className="truncate" title={panel.label}>{panel.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {activeTabId !== SAFETY_TAB_ID && (
                <TabManagementToolbar
                  currentTabId={activeTabId}
                  onTabChange={setActiveTabId}
                  currentPrompt={prompts[activeTabId] ?? panels.find(p => p.id === activeTabId)?.prompt ?? ''}
                  currentTitle={panels.find(p => p.id === activeTabId)?.title ?? ''}
                  onPromptChange={(prompt) => handlePromptChange(activeTabId, prompt)}
                />
              )}
              {/* Maximize — pop the insights panel into a fullscreen overlay. */}
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                title={t.common.maximize}
                aria-label={t.common.maximize}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
            <TabsContent value={SAFETY_TAB_ID} className="mt-0">
              <SafetyAlertsPanel />
            </TabsContent>
            {panelEntries.map((panel) => (
              <TabsContent key={panel.id} value={panel.id} className="mt-0">
                <InsightPanel {...panel.props} />
              </TabsContent>
            ))}
          </Tabs>
          <AlertDialog
            open={pendingRegenerateId !== null}
            onOpenChange={(next) => { if (!next) setPendingRegenerateId(null) }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.clinicalInsights.regenerateOverwriteTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t.clinicalInsights.regenerateOverwriteDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setPendingRegenerateId(null)}>
                  {t.common.cancel}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const id = pendingRegenerateId
                    setPendingRegenerateId(null)
                    if (id) runPanel(id, { force: true })
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t.clinicalInsights.regenerateOverwriteConfirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </>
        )}
      </div>
    </ScrollArea>
    </div>
  )
}
