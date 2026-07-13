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

// v12: surface clinically meaningful treatment patterns and true overlapping
// prescriptions from two non-pharmacy institutions. Older results regenerate.
export const summaryCacheKey = (scanKey: string) => aiResultCacheKey('medsummary12', scanKey)

// Module-level per-slot result cache (survives tab switches; wiped on bundle
// import so nothing stale renders against fresh clinical data).
export const medicalSummaryStore = createAiResultStore<MedicalSummaryResult>()
