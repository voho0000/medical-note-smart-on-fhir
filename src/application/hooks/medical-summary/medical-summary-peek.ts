'use client'

// Read-only peek at the MEDICAL-audience Medical Summary result for a patient.
//
// Used by the IPS export's 帶入醫療摘要 path (Path A): when a summary already
// exists, its verified problem list seeds the IPS problem-inference review
// instead of re-running a full LLM inference. This module never generates,
// never mutates the store, and never touches the summary's own hydration
// bookkeeping — it only reads.
//
// Lookup order (always restricted to the CURRENT settled clinical-input
// signature):
//   1. live store slots — any model counts;
//   2. the encrypted session cache, probing every known model id (covers a
//      page reload where the 醫療摘要 tab hasn't been opened yet).
import { useEffect, useMemo, useState } from 'react'
import { ALL_MODELS } from '@/src/shared/constants/ai-models.constants'
import { loadEncryptedCache } from '@/src/infrastructure/cache/encrypted-session-cache'
import { useLanguage } from '@/src/application/providers/language.provider'
import { patientAiSlotKey } from '@/src/application/hooks/ai-generation/ai-slot-key'
import { useClinicalAiInput } from '@/src/application/hooks/ai-generation/use-clinical-ai-input.hook'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'
import {
  medicalSummaryStore,
  summaryCacheKey,
  SUMMARY_CACHE_MAX_AGE_MS,
} from './medical-summary-store'

function medicalSlotKeys(
  patientId: string,
  locale: ReturnType<typeof useLanguage>['locale'],
  inputSignature: string,
): string[] {
  return ALL_MODELS.map((model) => patientAiSlotKey({
    patientId,
    audience: 'medical',
    locale,
    modelId: model.id,
    inputSignature,
  }))
}

function scanStore(
  byKey: Record<string, MedicalSummaryResult>,
  slotKeys: string[],
): MedicalSummaryResult | null {
  for (const key of slotKeys) {
    if (byKey[key]) return byKey[key]
  }
  return null
}

/**
 * The latest generated medical-audience summary for `patientId`, or null.
 * Reactive to the live store (a summary generated in another tab appears
 * without a remount); falls back to the encrypted session cache once.
 */
export function useMedicalSummaryPeek(patientId: string | null): MedicalSummaryResult | null {
  const { locale } = useLanguage()
  const clinicalInput = useClinicalAiInput()
  const inputMatchesPatient = Boolean(
    patientId
    && clinicalInput.dataReady
    && clinicalInput.patientId === patientId
    && clinicalInput.inputSignature,
  )
  const slotKeys = useMemo(
    () => (inputMatchesPatient && patientId
      ? medicalSlotKeys(patientId, locale, clinicalInput.inputSignature)
      : []),
    [clinicalInput.inputSignature, inputMatchesPatient, locale, patientId],
  )
  const byKey = medicalSummaryStore((s) => s.byKey)
  const storeHit = useMemo(() => scanStore(byKey, slotKeys), [byKey, slotKeys])
  const cacheIdentity = inputMatchesPatient && patientId
    ? `${patientId}::${locale}::${clinicalInput.inputSignature}`
    : ''

  const [cacheHit, setCacheHit] = useState<{
    identity: string
    result: MedicalSummaryResult | null
  } | null>(null)

  useEffect(() => {
    if (!cacheIdentity || storeHit) return
    if (cacheHit?.identity === cacheIdentity) return
    let cancelled = false
    void (async () => {
      for (const slotKey of slotKeys) {
        const cached = await loadEncryptedCache<MedicalSummaryResult>(
          summaryCacheKey(slotKey),
          SUMMARY_CACHE_MAX_AGE_MS,
        )
        if (cancelled) return
        if (cached) {
          setCacheHit({ identity: cacheIdentity, result: cached })
          return
        }
      }
      if (!cancelled) setCacheHit({ identity: cacheIdentity, result: null })
    })()
    return () => {
      cancelled = true
    }
  }, [cacheIdentity, storeHit, cacheHit, slotKeys])

  if (storeHit) return storeHit
  return cacheHit?.identity === cacheIdentity ? cacheHit.result : null
}
