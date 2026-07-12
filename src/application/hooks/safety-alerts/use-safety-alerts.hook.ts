// Proactive Safety Alerts hook — thin adapter over the shared AI
// slot-generation engine (src/application/hooks/ai-generation/): runs the
// pure-AI scan on the selected model, parses the structured reply, and caches
// the result per patient+audience+model so switching tabs doesn't re-run /
// re-bill. Supports a persisted "auto-scan" preference: when on, the scan
// fires once per patient automatically.
'use client'

import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { aiResultCacheKey } from '@/src/infrastructure/cache/encrypted-session-cache'
import { preflightContextWarning } from '@/src/shared/utils/context-budget'
import {
  generateSafetyAlertsUseCase,
  SAFETY_ALERTS_MODEL_ID,
} from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import type { SafetyScanResult, SafetySeverity } from '@/src/core/entities/safety-alert.entity'
import { demoSafetyScanSnapshots } from '@/src/infrastructure/demo/demo-ai-snapshots'
import { createAiResultStore } from '@/src/application/hooks/ai-generation/create-ai-result-store'
import { createModelPrefsStore } from '@/src/application/hooks/ai-generation/create-model-prefs-store'
import {
  useAiSlotGeneration,
  type AiSlotDemoContext,
  type AiSlotRunContext,
} from '@/src/application/hooks/ai-generation/use-ai-slot-generation.hook'

// Persist a completed scan per-patient so a page reload reuses it instead of
// re-billing the model. Same lifecycle as the bundle: encrypted with the tab
// session key, purged after 12h or when the session can't decrypt it.
const SAFETY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
const safetyCacheKey = (scanKey: string) => aiResultCacheKey('safety', scanKey)

// Module-level per-slot result cache (survives tab switches; wiped on bundle
// import so nothing stale renders against fresh clinical data).
const safetyAlertsStore = createAiResultStore<SafetyScanResult>()

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
    // Default OFF to match medical-summary autoGenerate. First-run onboarding
    // enables both only after the user explicitly consents to cloud AI.
    autoScan: false,
    setAutoScan: (value) => set({ autoScan: value }),
    modelId: SAFETY_ALERTS_MODEL_ID,
    setModelId: (id) => set({ modelId: id }),
  }),
})

export interface UseSafetyAlertsReturn {
  result: SafetyScanResult | undefined
  isScanning: boolean
  error: string | null
  hasPatient: boolean
  /** True once this exact patient+audience+model cache slot was restored. */
  isHydrated: boolean
  autoScan: boolean
  setAutoScan: (value: boolean) => void
  /** User-chosen scan model (independent of the chat model). */
  model: string
  setModel: (id: string) => void
  scan: () => Promise<void>
  /** Resolve a source-list key an alert cited (e.g. "L3") to its bundle
   *  record, for click-to-navigate citations. undefined = unknown/hallucinated. */
  resolveSource: (key: string) => SummarySourceCatalogEntry | undefined
}

export function useSafetyAlerts(): UseSafetyAlertsReturn {
  const autoScan = useSafetyPrefsStore((s) => s.autoScan)
  const setAutoScan = useSafetyPrefsStore((s) => s.setAutoScan)
  const modelId = useSafetyPrefsStore((s) => s.modelId)
  const setModelId = useSafetyPrefsStore((s) => s.setModelId)

  const run = useCallback(async (ctx: AiSlotRunContext): Promise<SafetyScanResult | null> => {
    const clinicalContext = ctx.getFullClinicalContext()
    // Pre-flight: this pipeline doesn't truncate, so warn (don't silently fail)
    // when the selected context alone overruns the model's window.
    const overflow = preflightContextWarning(clinicalContext, ctx.modelId, ctx.locale)
    if (overflow) toast.warning(overflow)
    const messages = generateSafetyAlertsUseCase.buildMessages({
      clinicalContext,
      locale: ctx.locale === 'zh-TW' ? 'zh-TW' : 'en',
      audience: ctx.audience === 'patient' ? 'patient' : 'medical',
      catalog: ctx.catalog,
    })

    let full = ''
    await ctx.ai.stream(messages, {
      modelId: ctx.modelId,
      onChunk: (chunk: string) => {
        full = chunk
      },
    })

    const parsed = generateSafetyAlertsUseCase.parseScanResult(full, ctx.catalog)
    if (!parsed) return null
    // "掃描 N 筆" must be a deterministic app-side count, not the model's
    // self-reported number (which varied 30/54/68 across runs on the same
    // patient) — use the record count we actually put in the SOURCE LIST.
    return { ...parsed, scannedCount: ctx.catalog.length }
  }, [])

  // Demo bundle: the snapshot goes through the same parseScanResult validation
  // as a live reply; re-scan / model switch stay live.
  const demoSeed = useCallback((ctx: AiSlotDemoContext): SafetyScanResult | null => {
    const snapshot = demoSafetyScanSnapshots[ctx.audience === 'patient' ? 'patient' : 'medical']
    const parsed = generateSafetyAlertsUseCase.parseScanResult(JSON.stringify(snapshot), ctx.catalog)
    if (!parsed) return null
    // Same deterministic count rule as a live scan (see run() above).
    return { ...parsed, scannedCount: ctx.catalog.length }
  }, [])

  const slot = useAiSlotGeneration<SafetyScanResult>({
    defaultModelId: SAFETY_ALERTS_MODEL_ID,
    selectedModelId: modelId,
    autoRunEnabled: autoScan,
    // Historical behavior: a MANUAL scan proceeds even mid-load (the catalog
    // and auto-scan are still dataReady-gated inside the engine).
    requireDataReadyToGenerate: false,
    resolveModelOverride: resolveSafetyModelOverride,
    store: safetyAlertsStore,
    cacheKeyFor: safetyCacheKey,
    cacheMaxAgeMs: SAFETY_CACHE_MAX_AGE_MS,
    run,
    demoSeed,
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

  // Switching model just changes which per-model slot the view reads — it does
  // NOT cancel or clear anything. The old model's in-flight scan keeps going and
  // lands in its own slot; the new model shows its cached result, its spinner if
  // still scanning, or auto-scans if it has neither (user directive 2026-07-07).
  const setModel = useCallback((id: string) => {
    setModelId(id)
  }, [setModelId])

  return {
    result: slot.result,
    isScanning: slot.isRunning,
    error: slot.error,
    hasPatient: slot.hasPatient,
    isHydrated: slot.isHydrated,
    autoScan,
    setAutoScan,
    model: modelId,
    setModel,
    scan: slot.generate,
    resolveSource,
  }
}

/** Severity breakdown shape for the section-nav chip (owned by the Medical
 *  Summary tab, which computes it from the single useSafetyAlerts result). */
export interface SafetyAlertCounts extends Record<SafetySeverity, number> {
  total: number
}
