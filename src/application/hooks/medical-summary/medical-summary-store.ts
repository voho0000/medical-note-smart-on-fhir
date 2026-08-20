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

// v15: every registered card, including Safety, lives in one result artifact
// and one cache entry. Older summary-only entries intentionally regenerate.
// v16: the timeline card carries milestones / careThreads / timelineStats. A
// v15 entry lacks them and would silently render the pre-v2 timeline, so those
// entries must regenerate rather than resolve as a fallback.
export const summaryCacheKey = (scanKey: string) => aiResultCacheKey('medsummary16', scanKey)

// Module-level per-slot result cache (survives tab switches; wiped on bundle
// import so nothing stale renders against fresh clinical data).
export const medicalSummaryStore = createAiResultStore<MedicalSummaryResult>()
