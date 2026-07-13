'use client'

// Read-only peek at the MEDICAL-audience Medical Summary result for a patient.
//
// Used by the IPS export's 帶入醫療摘要 path (Path A): when a summary already
// exists, its verified problem list seeds the IPS problem-inference review
// instead of re-running a full LLM inference. This module never generates,
// never mutates the store, and never touches the summary's own hydration
// bookkeeping — it only reads.
//
// Lookup order:
//   1. live store slots (`${patientId}::medical::<model>`) — any model counts;
//   2. the encrypted session cache, probing every known model id (covers a
//      page reload where the 醫療摘要 tab hasn't been opened yet).
import { useEffect, useMemo, useState } from 'react'
import { ALL_MODELS } from '@/src/shared/constants/ai-models.constants'
import { loadEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'
import {
  medicalSummaryStore,
  summaryCacheKey,
  SUMMARY_CACHE_MAX_AGE_MS,
} from './medical-summary-store'

const medicalSlotPrefix = (patientId: string) => `${patientId}::medical::`

function scanStore(
  byKey: Record<string, MedicalSummaryResult>,
  patientId: string | null,
): MedicalSummaryResult | null {
  if (!patientId) return null
  const prefix = medicalSlotPrefix(patientId)
  for (const [key, result] of Object.entries(byKey)) {
    if (key.startsWith(prefix)) return result
  }
  return null
}

/**
 * The latest generated medical-audience summary for `patientId`, or null.
 * Reactive to the live store (a summary generated in another tab appears
 * without a remount); falls back to the encrypted session cache once.
 */
export function useMedicalSummaryPeek(patientId: string | null): MedicalSummaryResult | null {
  const byKey = medicalSummaryStore((s) => s.byKey)
  const storeHit = useMemo(() => scanStore(byKey, patientId), [byKey, patientId])

  const [cacheHit, setCacheHit] = useState<{
    patientId: string
    result: MedicalSummaryResult | null
  } | null>(null)

  useEffect(() => {
    if (!patientId || storeHit) return
    if (cacheHit?.patientId === patientId) return
    let cancelled = false
    void (async () => {
      for (const model of ALL_MODELS) {
        const cached = await loadEncryptedCache<MedicalSummaryResult>(
          summaryCacheKey(`${medicalSlotPrefix(patientId)}${model.id}`),
          SUMMARY_CACHE_MAX_AGE_MS,
        )
        if (cancelled) return
        if (cached) {
          setCacheHit({ patientId, result: cached })
          return
        }
      }
      if (!cancelled) setCacheHit({ patientId, result: null })
    })()
    return () => {
      cancelled = true
    }
  }, [patientId, storeHit, cacheHit])

  if (storeHit) return storeHit
  return cacheHit?.patientId === patientId ? cacheHit.result : null
}
