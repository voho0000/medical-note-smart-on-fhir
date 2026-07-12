// Report Interpretation hook. Runs the pure-AI translate+interpret task for ONE
// report on a FIXED fast model (Gemini Flash-Lite), parses the structured reply,
// and caches the result per report so re-expanding / switching tabs doesn't
// re-run / re-bill. Purely ON-DEMAND — unlike the safety scan there is NO
// auto-run: a patient may have dozens of reports, so we never spend quota until
// the user presses the button on a specific report. (That's why this hook uses
// only the store + run-body pieces of the shared ai-generation machinery, not
// the patient-slot engine: its cache key is content-based, not patient-based.)
'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useUnifiedAi } from '@/src/application/hooks/ai/use-unified-ai.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import {
  loadEncryptedCache,
  aiResultCacheKey,
} from '@/src/infrastructure/cache/encrypted-session-cache'
import {
  generateReportInterpretationUseCase,
  prepareReportText,
  REPORT_INTERPRETATION_MODEL_ID,
} from '@/src/core/use-cases/report-interpretation/generate-report-interpretation.use-case'
import { createAiResultStore } from '@/src/application/hooks/ai-generation/create-ai-result-store'
import { runGenerationJob } from '@/src/application/hooks/ai-generation/run-generation-job'
import { buildReportInterpretationCompositeKey } from './report-interpretation-cache-key'
import type {
  ReportInterpretation,
  ReportInterpretationMode,
} from '@/src/core/entities/report-interpretation.entity'

// Persist a completed interpretation so a page reload reuses it instead of
// re-billing. Same lifecycle/key discipline as the safety scan cache.
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000
const cacheKey = (compositeKey: string) => aiResultCacheKey('report-interp', compositeKey)

// Module-level cache (survives tab switches / accordion collapse within a
// session; wiped when a new bundle is imported — the cache key already includes
// a content signature, but a full reset keeps re-import behaviour uniform with
// the summary/safety stores). Keyed by compositeKey =
// mode::audience::locale::contentSig, so the same narrative reuses one result
// across report and visit-history entry points even if their row ids differ,
// while text changes still invalidate it.
const useStore = createAiResultStore<ReportInterpretation>()

export interface UseReportInterpretationArgs {
  /** Stable host id for UI/debug identity. The AI cache is content-based so the
   *  same narrative can be reused across report and visit-history entry points
   *  even when those hosts build different row ids. */
  reportId: string
  /** Raw report text (already HTML-stripped by the caller). */
  reportText: string
  /** Human-readable title, passed to the model for context. */
  reportTitle?: string
  /** Standard reports get faithful translation; long documents get digest mode. */
  mode?: ReportInterpretationMode
}

export interface UseReportInterpretationReturn {
  result: ReportInterpretation | undefined
  isGenerating: boolean
  error: string | null
  /** False when there's no text worth interpreting (button should be hidden). */
  hasText: boolean
  /** True after the persisted cache has been checked for this report key. */
  isHydrated: boolean
  /** Generate if not already cached / in-flight. Safe to call repeatedly. */
  generate: () => Promise<void>
  /** Force a fresh run (clears the cached slot first). */
  regenerate: () => Promise<void>
}

export function useReportInterpretation(
  args: UseReportInterpretationArgs,
): UseReportInterpretationReturn {
  const { reportText, reportTitle, mode = 'standard' } = args
  const ai = useUnifiedAi()
  const { locale } = useLanguage()
  const { audience } = useAudience()

  const targetLocale: 'en' | 'zh-TW' = locale === 'zh-TW' ? 'zh-TW' : 'en'
  const targetAudience: 'medical' | 'patient' = audience === 'patient' ? 'patient' : 'medical'

  const clean = (reportText ?? '').trim()
  const hasText = clean.length > 0

  // Signature over the clamped text — invalidates the cache if the source report
  // text changes, and keeps the key bounded for huge documents.
  const compositeKey = useMemo(() => {
    if (!hasText) return ''
    const { text } = prepareReportText(clean, mode)
    return buildReportInterpretationCompositeKey({
      mode,
      audience: targetAudience,
      locale: targetLocale,
      preparedText: text,
    })
  }, [hasText, clean, mode, targetAudience, targetLocale])

  const result = useStore((s) => (compositeKey ? s.byKey[compositeKey] : undefined))
  const setResult = useStore((s) => s.setResult)
  const clearSlot = useStore((s) => s.clear)
  const isGenerating = useStore((s) => (compositeKey ? !!s.running[compositeKey] : false))
  const error = useStore((s) => (compositeKey ? s.errors[compositeKey] ?? null : null))
  const isHydrated = useStore((s) => (compositeKey ? !!s.hydrated[compositeKey] : false))
  const setHydrated = useStore((s) => s.setHydrated)

  // Restore a persisted result on (re)load before the user re-presses. Only read
  // the cache when the module store is empty for this key (i.e. after a reload).
  useEffect(() => {
    if (!compositeKey) return
    if (useStore.getState().byKey[compositeKey]) {
      setHydrated(compositeKey, true)
      return
    }
    if (useStore.getState().hydrated[compositeKey]) return
    let cancelled = false
    void loadEncryptedCache<ReportInterpretation>(cacheKey(compositeKey), CACHE_MAX_AGE_MS).then(
      (cached) => {
        if (cancelled) return
        if (cached) setResult(compositeKey, cached)
        setHydrated(compositeKey, true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [compositeKey, setHydrated, setResult])

  const run = useCallback(
    async (force: boolean) => {
      if (!compositeKey || !hasText) return
      if (!useStore.getState().hydrated[compositeKey]) return
      if (!force && useStore.getState().byKey[compositeKey]) return
      // Never double-start the same slot; a different report may run concurrently.
      // (Checked here too so a forced re-run doesn't clear a slot mid-flight.)
      if (useStore.getState().running[compositeKey]) return
      const myKey = compositeKey
      if (force) clearSlot(myKey)
      await runGenerationJob({
        store: useStore,
        key: myKey,
        cacheKey: cacheKey(myKey),
        produce: async () => {
          const prepared = prepareReportText(clean, mode)
          const messages = generateReportInterpretationUseCase.buildMessages({
            reportText: clean,
            reportTitle,
            locale: targetLocale,
            audience: targetAudience,
            mode,
          })
          let full = ''
          await ai.stream(messages, {
            modelId: REPORT_INTERPRETATION_MODEL_ID,
            onChunk: (chunk: string) => {
              full = chunk
            },
          })
          return generateReportInterpretationUseCase.parseResult(full, {
            truncated: prepared.truncated,
            coverage: prepared.coverage,
            mode: prepared.mode,
          })
        },
      })
    },
    [compositeKey, hasText, clean, mode, reportTitle, targetLocale, targetAudience, ai, clearSlot],
  )

  const generate = useCallback(() => run(false), [run])
  const regenerate = useCallback(() => run(true), [run])

  return {
    result,
    isGenerating,
    error,
    hasText,
    isHydrated,
    generate,
    regenerate,
  }
}
