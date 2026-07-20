// Proactive Safety Alerts hook — thin adapter over the shared AI
// slot-generation engine (src/application/hooks/ai-generation/): runs the
// pure-AI scan on the selected model, parses the structured reply, and caches
// the result per patient/audience/locale/model/exact clinical input so switching
// tabs doesn't re-run / re-bill or restore a scan for stale data. Supports a
// persisted "auto-scan" preference: when on, the scan
// fires once per patient automatically.
'use client'

import { useCallback, useMemo } from 'react'
import { aiResultCacheKey } from '@/src/infrastructure/cache/encrypted-session-cache'
import {
  ContextOverflowError,
  createContextOverflowIssue,
  type ContextOverflowIssue,
} from '@/src/shared/utils/context-budget'
import {
  generateSafetyAlertsUseCase,
  SAFETY_ALERTS_MODEL_ID,
} from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import type { SafetyScanResult, SafetySeverity } from '@/src/core/entities/safety-alert.entity'
import {
  DEMO_SAFETY_SCAN_GENERATION,
  demoSafetyScanSnapshots,
} from '@/src/infrastructure/demo/demo-ai-snapshots'
import { createAiResultStore } from '@/src/application/hooks/ai-generation/create-ai-result-store'
import { createModelPrefsStore } from '@/src/application/hooks/ai-generation/create-model-prefs-store'
import {
  useAiSlotGeneration,
  type AiSlotDemoContext,
  type AiSlotRunContext,
} from '@/src/application/hooks/ai-generation/use-ai-slot-generation.hook'
import {
  isAutoAiEnabledForSource,
  useAutoAiConsentState,
} from '@/src/application/hooks/ai-generation/auto-ai-consent'

// Persist a completed scan per-patient so a page reload reuses it instead of
// re-billing the model. Same lifecycle as the bundle: encrypted with the tab
// session key, purged after 12h or when the session can't decrypt it.
const SAFETY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
const safetyCacheKey = (scanKey: string) => aiResultCacheKey('safety', scanKey)

// Module-level per-slot result cache (survives tab switches; wiped on bundle
// import so nothing stale renders against fresh clinical data).
const safetyAlertsStore = createAiResultStore<SafetyScanResult>()

const safetyResultModelId = (result: SafetyScanResult) =>
  result.generation?.modelId

// Playwright seam (e2e/tests/safety-alerts.spec.ts) — dev/test builds only;
// Next.js dead-code-eliminates this branch from the production bundle so
// shipped code can't have its model gating bypassed via the console.
function resolveSafetyModelOverride(): string | undefined {
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    const override = (window as { __safetyModelId?: string }).__safetyModelId
    if (typeof override === 'string' && override) return override
  }
  return undefined
}

// Persisted user preferences: auto-scan on patient load, and the model the scan
// runs on (INDEPENDENT of the chat/insights model in ai-config-storage).
interface SafetyPrefsStore {
  autoScan: boolean
  setAutoScan: (value: boolean) => void
  modelId: string
  setModelId: (id: string) => void
}
// Exported so the first-run onboarding can set the auto-scan preference WITHOUT
// mounting the full useSafetyAlerts hook (which carries the auto-scan effect).
export const useSafetyPrefsStore = createModelPrefsStore<SafetyPrefsStore>({
  storageName: 'safety-alerts-prefs',
  defaultModelId: SAFETY_ALERTS_MODEL_ID,
  initializer: (set) => ({
    // Default OFF to match medical-summary autoGenerate. Real-data auto-runs
    // also pass through the separate source-aware consent gate.
    autoScan: false,
    setAutoScan: (value) => set({ autoScan: value }),
    modelId: SAFETY_ALERTS_MODEL_ID,
    setModelId: (id) => set({ modelId: id }),
  }),
})

export interface UseSafetyAlertsReturn {
  result: SafetyScanResult | undefined
  /** Actual model that owns result; may differ from model while an empty slot
   * uses the previously visible safety scan as fallback. */
  resultOwnerModelId: string | null
  /** Exact endpoint/model cache identity that owns result. */
  resultOwnerRuntimeId: string | null
  isScanning: boolean
  error: string | null
  issue: ContextOverflowIssue | null
  hasPatient: boolean
  /** Exact model/content slot selected for the next scan. */
  generationSlotKey: string
  isCurrentSlotGenerating: boolean
  readGenerationSlot: (slotKey: string) => {
    result: SafetyScanResult | undefined
    isRunning: boolean
    error: string | null
    issue: ContextOverflowIssue | null
  }
  /** True when this clinical-input scope has a presentable restored result. */
  isHydrated: boolean
  autoScan: boolean
  setAutoScan: (value: boolean) => void
  /** User-chosen scan model (independent of the chat model). */
  model: string
  setModel: (id: string) => void
  scan: () => Promise<void>
  cancel: (slotKey?: string) => void
  restoreGenerationSlot: (slotKey: string, result: SafetyScanResult | undefined) => void
  /** Resolve a source-list key an alert cited (e.g. "L3") to its bundle
   *  record, for click-to-navigate citations. undefined = unknown/hallucinated. */
  resolveSource: (key: string) => SummarySourceCatalogEntry | undefined
}

export function useSafetyAlerts(): UseSafetyAlertsReturn {
  const autoScan = useSafetyPrefsStore((s) => s.autoScan)
  const setAutoScan = useSafetyPrefsStore((s) => s.setAutoScan)
  const modelId = useSafetyPrefsStore((s) => s.modelId)
  const setModelId = useSafetyPrefsStore((s) => s.setModelId)
  const autoAiConsent = useAutoAiConsentState()

  const run = useCallback(async (ctx: AiSlotRunContext): Promise<SafetyScanResult | null> => {
    const messages = generateSafetyAlertsUseCase.buildMessages({
      clinicalContext: ctx.clinicalContext,
      locale: ctx.locale === 'zh-TW' ? 'zh-TW' : 'en',
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
      catalog: ctx.catalog,
    })
    const overflow = createContextOverflowIssue(
      messages.map((message) => message.content).join('\n\n'),
      ctx.modelId,
      {
        selectedContext: ctx.clinicalContext,
        contextLimit: ctx.contextLimit,
      },
    )
    if (overflow) {
      throw new ContextOverflowError(overflow, ctx.locale)
    }

    let full = ''
    await ctx.ai.stream(messages, {
      modelId: ctx.modelId,
      operationKey: ctx.operationKey,
      throwOnAbort: true,
      onChunk: (chunk: string) => {
        full = chunk
      },
    })

    const parsed = generateSafetyAlertsUseCase.parseScanResult(full, ctx.catalog)
    if (!parsed) return null
    // "掃描 N 筆" must be a deterministic app-side count, not the model's
    // self-reported number (which varied 30/54/68 across runs on the same
    // patient) — use the record count we actually put in the SOURCE LIST.
    return {
      ...parsed,
      scannedCount: ctx.catalog.length,
      generation: {
        source: 'live',
        modelId: ctx.modelId,
        modelName: ctx.modelName,
        generatedAt: Date.now(),
      },
    }
  }, [])

  // Demo bundle: the snapshot goes through the same parseScanResult validation
  // as a live reply; re-scan / model switch stay live.
  const demoSeed = useCallback((ctx: AiSlotDemoContext): SafetyScanResult | null => {
    const snapshot = demoSafetyScanSnapshots[ctx.audience === 'patient' ? 'patient' : 'medical']
    const parsed = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify(snapshot), ctx.catalog)
    if (!parsed) return null
    // Same deterministic count rule as a live scan (see run() above).
    return {
      ...parsed,
      scannedCount: ctx.catalog.length,
      generation: DEMO_SAFETY_SCAN_GENERATION,
    }
  }, [])

  const slot = useAiSlotGeneration<SafetyScanResult>({
    defaultModelId: SAFETY_ALERTS_MODEL_ID,
    selectedModelId: modelId,
    // Do not let a demo preference become authorization for real patient data.
    autoRunEnabled: isAutoAiEnabledForSource(autoScan, autoAiConsent),
    // A safety result over partial data is itself unsafe and may be cached for
    // 12h, so manual and automatic scans share the same readiness gate.
    requireDataReadyToGenerate: true,
    resolveModelOverride: resolveSafetyModelOverride,
    store: safetyAlertsStore,
    cacheKeyFor: safetyCacheKey,
    cacheMaxAgeMs: SAFETY_CACHE_MAX_AGE_MS,
    run,
    demoSeed,
    resultModelId: safetyResultModelId,
    retainResultOnModelChange: true,
  })

  // Catalog lookup so the UI can resolve cited keys into click-to-navigate
  // citations.
  const catalogByKey = useMemo(
    () => new Map(slot.catalog.map((c) => [c.key, c])),
    [slot.catalog],
  )
  const resolveSource = useCallback(
    (key: string) => catalogByKey.get(key.trim()),
    [catalogByKey],
  )

  // The picker restores that model's latest completed scan when available.
  // With an empty target slot, keep the last visible scan until this model
  // succeeds; in-flight work still lands in the slot that actually ran.
  const setModel = useCallback((id: string) => {
    setModelId(id)
  }, [setModelId])

  const readGenerationSlot = useCallback((slotKey: string) => {
    const state = safetyAlertsStore.getState()
    return {
      result: state.byKey[slotKey],
      isRunning: Boolean(state.running[slotKey]),
      error: state.errors[slotKey] ?? null,
      issue: state.issues[slotKey] ?? null,
    }
  }, [])

  return {
    result: slot.result,
    resultOwnerModelId: slot.resultOwnerModelId,
    resultOwnerRuntimeId: slot.resultOwnerRuntimeId,
    isScanning: slot.isAnyRunning,
    error: slot.error,
    issue: slot.issue,
    hasPatient: slot.hasPatient,
    generationSlotKey: slot.slotKey,
    isCurrentSlotGenerating: slot.isRunning,
    readGenerationSlot,
    isHydrated: slot.isHydrated,
    autoScan,
    setAutoScan,
    model: modelId,
    setModel,
    scan: slot.generate,
    cancel: slot.cancel,
    restoreGenerationSlot: slot.restoreSlot,
    resolveSource,
  }
}

/** Severity breakdown shape for the section-nav chip (owned by the Medical
 *  Summary tab, which computes it from the single useSafetyAlerts result). */
export interface SafetyAlertCounts extends Record<SafetySeverity, number> {
  total: number
}
