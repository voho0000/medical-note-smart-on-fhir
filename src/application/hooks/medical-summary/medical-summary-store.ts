// Medical Summary result store + cache-key scheme, extracted from
// use-medical-summary.hook.ts so read-only consumers (IPS export's
// 帶入醫療摘要 path) can peek at generated summaries without importing the
// full generation hook graph (providers, unified AI, toasts…).
//
// Slot key format (owned by use-ai-slot-generation):
// patientId::audience::locale::model::ctx-<selected-clinical-input-signature>.
import { createAiResultStore } from '@/src/application/hooks/ai-generation/create-ai-result-store'
import { aiResultCacheKey } from '@/src/infrastructure/cache/encrypted-session-cache'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'

export const SUMMARY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000

// v14: unknown model-issued source keys are retained as claim-level warnings
// instead of module errors. Do not restore v13 GROUNDING_FAILED entries: their
// parsed card payload was discarded, so only a fresh run can recover it for
// the warning-first display.
export const summaryCacheKey = (scanKey: string) => aiResultCacheKey('medsummary14', scanKey)

// Module-level per-slot result cache (survives tab switches; wiped on bundle
// import so nothing stale renders against fresh clinical data).
export const medicalSummaryStore = createAiResultStore<MedicalSummaryResult>()
