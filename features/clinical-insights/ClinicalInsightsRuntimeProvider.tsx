"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useAuth } from "@/src/application/providers/auth.provider"
import { useAllApiKeys } from "@/src/application/stores/ai-config.store"
import { useEffectiveModel } from "@/src/application/stores/model-prefs.store"
import {
  useClinicalInsightsConfig,
  type InsightPanelConfig,
} from "@/src/application/providers/clinical-insights-config.provider"
import { hasChatProxy, hasClaudeProxy, hasGeminiProxy } from "@/src/shared/config/env.config"
import { getModelDefinition } from "@/src/shared/constants/ai-models.constants"
import {
  hasDirectModelAccess,
  modelContextLimit,
  modelRuntimeIdentity,
} from '@/src/shared/utils/model-access.utils'
import { isOpenAiCompatibleRuntimeReady } from '@/src/shared/utils/openai-compatible.utils'
import {
  aiResultCacheKey,
  contentSignature,
  loadEncryptedCache,
  removeEncryptedCache,
  saveEncryptedCache,
} from "@/src/infrastructure/cache/encrypted-session-cache"
import { useInsightGeneration } from "./hooks/useInsightGeneration"
import { useInsightPanels } from "./hooks/useInsightPanels"
import { useInsightResponsesStore } from "./hooks/useInsightResponsesStore"
import { useAutoGenerate } from "./hooks/useAutoGenerate"
import type { PanelStatus, ResponseEntry } from "./types"
import {
  getDemoClinicalInsightSnapshot,
} from "@/src/infrastructure/demo/demo-ai-snapshots"
import {
  canAutoRunAi,
  useAutoAiConsentState,
} from '@/src/application/hooks/ai-generation/auto-ai-consent'
import { BUNDLE_CHANGED_EVENT } from '@/src/shared/utils/reset-on-bundle-change'

const INSIGHTS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
const INSIGHTS_PIPELINE_VERSION = "custom-summary-modules-v1"

interface CachedInsightEntry {
  entry: ResponseEntry
  promptSig: string
  contextSig: string
  modelId: string
  pipelineVersion: string
}

interface ClinicalInsightsRuntimeValue {
  panels: InsightPanelConfig[]
  prompts: Record<string, string>
  model: string
  canGenerate: boolean
  hasData: boolean
  clinicalDataLoading: boolean
  clinicalDataError: unknown
  responses: Record<string, ResponseEntry>
  panelStatus: Record<string, PanelStatus>
  runPanel: (panelId: string, options?: { force?: boolean }) => Promise<void>
  stopPanel: (panelId: string) => void
  stopAll: () => void
  handlePromptChange: (panelId: string, value: string) => void
  handleResponseChange: (panelId: string, value: string) => void
  clearResponse: (panelId: string) => void
}

const ClinicalInsightsRuntimeContext = createContext<ClinicalInsightsRuntimeValue | null>(null)

function panelCacheKey(patientId: string, panelId: string): string {
  return aiResultCacheKey("insight-module-v1", `${patientId}:${panelId}`)
}

/**
 * Owns the custom-insight generation lifecycle exactly once. Both the legacy
 * workbench tab and Medical Summary are views over this runtime, so mounting
 * both cannot duplicate auto-runs or race their caches.
 */
export function ClinicalInsightsRuntimeProvider({ children }: { children: ReactNode }) {
  const { panels } = useClinicalInsightsConfig()
  const { audience } = useAudience()
  const { apiKey: openAiKey, geminiKey, claudeKey, openAiCompatible } = useAllApiKeys()
  const { user, isAnonymous, loading: authLoading } = useAuth()
  const { getFullClinicalContext } = useClinicalContext("insights")
  const {
    isLoading: clinicalDataLoading,
    isFetching: clinicalDataFetching,
    error: clinicalDataError,
    hasBlockingQueryIssues,
  } = useClinicalData()
  const { patient } = usePatient()
  const patientId = patient?.id ?? ""
  const model = useEffectiveModel("insights")
  const autoAiConsent = useAutoAiConsentState()
  const [hydratedCacheIdentity, setHydratedCacheIdentity] = useState<string | null>(null)
  const [bundleRevision, setBundleRevision] = useState(0)
  const previousRuntimeIdentity = useRef<string | null>(null)

  const { prompts, handlePromptChange } = useInsightPanels(panels)
  const context = useMemo(() => getFullClinicalContext(), [getFullClinicalContext])
  const modelProvider = getModelDefinition(model)?.provider
  const hasModelProviderKey = hasDirectModelAccess(
    model,
    { openAiKey, geminiKey, claudeKey },
    openAiCompatible,
  )
  const hasModelProxy =
    modelProvider === 'gemini' ? hasGeminiProxy :
    modelProvider === 'claude' ? hasClaudeProxy :
    modelProvider === 'openai' ? hasChatProxy : false
  const canGenerate = modelProvider === 'custom'
    ? isOpenAiCompatibleRuntimeReady(openAiCompatible)
    : hasModelProviderKey || hasModelProxy
  const runtimeModelId = modelRuntimeIdentity(model, openAiCompatible)
  const contextLimit = modelContextLimit(model, openAiCompatible)
  const autoRunScope = authLoading
    ? "auth-loading"
    : hasModelProviderKey
      ? "own-key"
      : user
        ? `user:${user.uid}`
        : isAnonymous
          ? "anonymous"
          : "no-session"
  const resetForPatient = useInsightResponsesStore((state) => state.resetForPatient)
  const setPanelStatus = useInsightResponsesStore((state) => state.setPanelStatus)

  const {
    runPanel,
    runPanels,
    stopPanel,
    stopAll,
    responses,
    panelStatus,
    setResponses,
  } = useInsightGeneration({ panels, prompts, context, model, contextLimit })

  // A new local Bundle is a new authorization and result scope even when it has
  // the same patient id and formatted clinical context as the previous import.
  // Clear custom-module state on the shared import signal so an old response
  // cannot suppress or masquerade as the newly authorized run.
  useEffect(() => {
    const resetForBundle = () => {
      stopAll()
      previousRuntimeIdentity.current = null
      setHydratedCacheIdentity(null)
      setResponses({})
      setPanelStatus({})
      setBundleRevision((revision) => revision + 1)
    }
    window.addEventListener(BUNDLE_CHANGED_EVENT, resetForBundle)
    return () => window.removeEventListener(BUNDLE_CHANGED_EVENT, resetForBundle)
  }, [setPanelStatus, setResponses, stopAll])

  const handleResponseChange = useCallback((panelId: string, value: string) => {
    setResponses((previous) => ({
      ...previous,
      [panelId]: {
        text: value,
        isEdited: true,
        metadata: value === "" ? null : (previous[panelId]?.metadata ?? null),
      },
    }))
  }, [setResponses])

  const clearResponse = useCallback((panelId: string) => {
    setResponses((previous) => ({
      ...previous,
      [panelId]: { text: "", isEdited: false, metadata: null },
    }))
    if (patientId) removeEncryptedCache(panelCacheKey(patientId, panelId))
  }, [patientId, setResponses])

  useEffect(() => {
    const owner = useInsightResponsesStore.getState().ownerPatientId
    if (patientId && owner && owner !== patientId) stopAll()
    resetForPatient(patientId)
  }, [patientId, resetForPatient, stopAll])

  const contextSig = useMemo(() => contentSignature(context), [context])
  const clinicalDataReady = !clinicalDataLoading
    && !clinicalDataFetching
    && !clinicalDataError
    && !hasBlockingQueryIssues
  const runtimeIdentity = patientId && context.trim() && clinicalDataReady
    ? `${bundleRevision}:${patientId}:${contextSig}:${runtimeModelId}:${INSIGHTS_PIPELINE_VERSION}`
    : ""

  // A model or source-context change invalidates every module for this patient.
  // Prompt-only changes are handled per card by the signatures below.
  useEffect(() => {
    if (!runtimeIdentity) return
    const previous = previousRuntimeIdentity.current
    previousRuntimeIdentity.current = runtimeIdentity
    if (!previous || previous === runtimeIdentity) return
    stopAll()
    setResponses({})
    setPanelStatus({})
  }, [runtimeIdentity, setPanelStatus, setResponses, stopAll])

  const promptSig = useCallback((panelId: string) => {
    const prompt = prompts[panelId] ?? panels.find((panel) => panel.id === panelId)?.prompt ?? ""
    return contentSignature(prompt)
  }, [panels, prompts])

  const panelPromptIdentity = useMemo(
    () => JSON.stringify(panels.map((panel) => ({ id: panel.id, promptSig: promptSig(panel.id) }))),
    [panels, promptSig],
  )
  const cacheIdentity = runtimeIdentity ? `${runtimeIdentity}:${panelPromptIdentity}` : ""
  // Hydrate every card independently. Cache validity includes the current
  // patient context, prompt, model and pipeline version.
  useEffect(() => {
    const descriptors = JSON.parse(panelPromptIdentity) as Array<{ id: string; promptSig: string }>
    if (!runtimeIdentity || descriptors.length === 0) return
    let cancelled = false
    void Promise.all(descriptors.map(async (panel) => {
      const cached = await loadEncryptedCache<CachedInsightEntry>(
        panelCacheKey(patientId, panel.id),
        INSIGHTS_CACHE_MAX_AGE_MS,
      )
      if (!cached) {
        // The demo bundle is frozen and its bundled insight snapshots are
        // audited constants. Restore them regardless of a model preference
        // retained from the user's own data; otherwise the hidden custom-
        // insight runtime can silently start cloud AI while the standard demo
        // summary is loading. A deliberate regenerate still uses `model`.
        const demo = getDemoClinicalInsightSnapshot(patientId, audience, panel.id)
        if (demo && contentSignature(demo.prompt) === panel.promptSig) {
          return [panel.id, { text: demo.text, isEdited: false, metadata: null }] as const
        }
        return null
      }
      if (
        cached.promptSig !== panel.promptSig ||
        cached.contextSig !== contextSig ||
        cached.modelId !== runtimeModelId ||
        cached.pipelineVersion !== INSIGHTS_PIPELINE_VERSION
      ) return null
      return [panel.id, cached.entry] as const
    })).then((entries) => {
      if (cancelled) return
      const restored = Object.fromEntries(entries.filter((entry): entry is readonly [string, ResponseEntry] => entry !== null))
      setResponses(restored)
      setHydratedCacheIdentity(cacheIdentity)
    })

    return () => { cancelled = true }
  }, [audience, cacheIdentity, contextSig, runtimeModelId, panelPromptIdentity, patientId, runtimeIdentity, setResponses])

  // Persist each completed card separately; one slow or failed module never
  // blocks another module from becoming reusable on refresh.
  useEffect(() => {
    if (!runtimeIdentity || hydratedCacheIdentity !== cacheIdentity) return
    for (const panel of panels) {
      if (panelStatus[panel.id]?.isLoading) continue
      const entry = responses[panel.id]
      const key = panelCacheKey(patientId, panel.id)
      if (!entry?.text?.trim() || panelStatus[panel.id]?.error) {
        removeEncryptedCache(key)
        continue
      }
      const cached: CachedInsightEntry = {
        entry,
        promptSig: promptSig(panel.id),
        contextSig,
        modelId: runtimeModelId,
        pipelineVersion: INSIGHTS_PIPELINE_VERSION,
      }
      void saveEncryptedCache(key, cached)
    }
  }, [cacheIdentity, contextSig, hydratedCacheIdentity, runtimeModelId, panelStatus, panels, patientId, promptSig, responses, runtimeIdentity])

  useAutoGenerate({
    panels,
    canGenerate: canGenerate
      && clinicalDataReady
      && !authLoading
      && hydratedCacheIdentity === cacheIdentity,
    autoRunAuthorized: canAutoRunAi(autoAiConsent),
    context,
    modelId: model,
    runPanels,
    responses,
    panelStatus,
    runScope: `${autoRunScope}:${autoAiConsent.source}:${autoAiConsent.importId ?? autoAiConsent.decision ?? 'none'}:${bundleRevision}`,
  })

  const hasData = clinicalDataReady && context.trim().length > 0 && hydratedCacheIdentity === cacheIdentity

  const value = useMemo<ClinicalInsightsRuntimeValue>(() => ({
    panels,
    prompts,
    model,
    canGenerate,
    hasData,
    clinicalDataLoading: clinicalDataLoading || clinicalDataFetching,
    clinicalDataError,
    responses,
    panelStatus,
    runPanel,
    stopPanel,
    stopAll,
    handlePromptChange,
    handleResponseChange,
    clearResponse,
  }), [
    panels,
    prompts,
    model,
    canGenerate,
    hasData,
    clinicalDataLoading,
    clinicalDataFetching,
    clinicalDataError,
    responses,
    panelStatus,
    runPanel,
    stopPanel,
    stopAll,
    handlePromptChange,
    handleResponseChange,
    clearResponse,
  ])

  return (
    <ClinicalInsightsRuntimeContext.Provider value={value}>
      {children}
    </ClinicalInsightsRuntimeContext.Provider>
  )
}

export function useClinicalInsightsRuntime() {
  const context = useContext(ClinicalInsightsRuntimeContext)
  if (!context) throw new Error("useClinicalInsightsRuntime must be used within ClinicalInsightsRuntimeProvider")
  return context
}
