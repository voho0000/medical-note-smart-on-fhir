// Medical Summary (醫療摘要) — the FIXED, structured shape the AI must return so
// the UI renders固定卡片 instead of free-text markdown (same philosophy as
// safety-alert.entity.ts). The AI may ONLY cite data via reference keys taken
// from an app-built source catalog; dates / organizations / resource types are
// never AI output — they are resolved app-side from the FHIR bundle, which is
// what makes the timeline and source chips hallucination-proof.
import { z } from 'zod'

export const SUMMARY_URGENCIES = ['high', 'medium', 'low'] as const
export type SummaryUrgency = (typeof SUMMARY_URGENCIES)[number]

export const TIMELINE_CATEGORIES = [
  'diagnosis',
  'procedure',
  'medication',
  'encounter',
  'lab',
  'followup',
] as const
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number]

// What KIND of evidence an inferred problem rests on — drives the card badge.
// 'diagnosis' = coded on a claim; the rest are cross-referenced inferences
// (abnormal labs, dispensed meds implying a condition, a care plan, a
// discharge summary). 'careplan' reads as more authoritative than a pattern.
export const PROBLEM_KINDS = [
  'diagnosis',
  'lab',
  'medication',
  'careplan',
  'discharge',
  'other',
] as const
export type ProblemKind = (typeof PROBLEM_KINDS)[number]

// ---------------------------------------------------------------------------
// AI output schema (validated with Zod; malformed replies are rejected)
// ---------------------------------------------------------------------------

// One narrative segment. `emphasis` segments render as highlights; `sources`
// hold catalog keys (e.g. "E1") — never free-text citations.
export const SummarySegmentSchema = z.object({
  text: z.string().min(1).max(400),
  emphasis: z.boolean().optional().default(false),
  sources: z.array(z.string()).max(6).optional().default([]),
})

export const SummaryDecisionSchema = z.object({
  text: z.string().min(1).max(400),
  urgency: z.enum(SUMMARY_URGENCIES),
  rationale: z.string().max(400).optional(),
  sources: z.array(z.string()).max(6).optional().default([]),
})

// Timeline pick: the model only CHOOSES an event (by catalog key) and labels
// it. Lenient on category (off-list → coerced) like safety-alert categories.
export const TimelinePickSchema = z.object({
  ref: z.string().min(1),
  label: z.string().min(1).max(200),
  category: z.string().optional(),
})

// Inferred active-problem list: the model synthesises problems from ALL data
// types (coded diagnoses, abnormal labs, dispensed meds, care plans, discharge
// summaries) — not just claim ICD codes — and cites the records via catalog keys.
// Deliberately NO ICD field: LLM-emitted codes proved unstable across runs
// (N18 / N18.3 / N18.9 for the same patient) and unverifiable codes must not
// look authoritative. The problem NAME + navigable sources are the product.
export const SummaryProblemSchema = z.object({
  label: z.string().min(1).max(120),
  /** Short human-readable basis, e.g. "5 次檢驗異常" / "藥局調劑". */
  basis: z.string().max(80).optional(),
  /** What kind of evidence — drives the badge (off-list → 'other'). */
  kind: z.string().optional(),
  sources: z.array(z.string()).max(6).optional().default([]),
})

export const MedicalSummaryAiResultSchema = z.object({
  headline: z.string().min(1).max(240),
  summary: z.array(SummarySegmentSchema).min(1).max(16),
  problems: z.array(SummaryProblemSchema).max(20).default([]),
  decisions: z.array(SummaryDecisionSchema).max(10).default([]),
  timeline: z.array(TimelinePickSchema).max(16).default([]),
})
export type MedicalSummaryAiResult = z.infer<typeof MedicalSummaryAiResultSchema>

// ---------------------------------------------------------------------------
// App-side catalog & finalized (verified) result
// ---------------------------------------------------------------------------

/** Encounter subtype derived from FHIR `Encounter.class` (IMP/EMER/AMB…) —
 *  app-side and deterministic, so 住院 never renders as 門診 just because the
 *  AI could only say "encounter". */
export type EncounterClass = 'inpatient' | 'emergency' | 'outpatient'

/** One citable data point, built deterministically from the bundle. */
export interface SummarySourceCatalogEntry {
  /** Stable prompt key, e.g. "E1" (encounter), "M3" (medication). */
  key: string
  resourceType: string
  resourceId: string
  display: string
  /** ISO date (YYYY-MM-DD) taken from the resource — never from the AI. */
  date?: string
  organization?: string
  /** Only set for Encounter entries whose class is recognisable. */
  encounterClass?: EncounterClass
}

/** A cited source resolved against the catalog. `verified: false` means the
 *  model cited a key that doesn't exist in the bundle — shown, not hidden. */
export interface ResolvedSourceRef {
  key: string
  /** 1-based display number used for superscripts + chips. */
  num: number
  verified: boolean
  resourceType?: string
  /** Bundle id — present iff verified; drives left-panel navigation. */
  resourceId?: string
  display?: string
  date?: string
  organization?: string
}

export interface SummaryTimelineEvent {
  key: string
  date: string
  label: string
  category: TimelineCategory
  organization?: string
  resourceType: string
  /** Bundle id of the underlying resource — lets the timeline row navigate
   *  the left panel to the raw resource (second evidence layer). */
  resourceId: string
  /** For category 'encounter': 住院/急診/門診, derived from Encounter.class. */
  encounterClass?: EncounterClass
}

export interface SummaryProblem {
  label: string
  basis?: string
  kind: ProblemKind
  sourceKeys: string[]
}

export interface MedicalSummaryResult {
  headline: string
  summary: Array<{ text: string; emphasis: boolean; sourceKeys: string[] }>
  problems: SummaryProblem[]
  decisions: Array<{
    text: string
    urgency: SummaryUrgency
    rationale?: string
    sourceKeys: string[]
  }>
  timeline: SummaryTimelineEvent[]
  /** Unique cited sources in first-appearance order, matching the RENDER
   *  order (summary → problems → decisions) so superscript numbers read
   *  top-to-bottom on the page. */
  sourceIndex: ResolvedSourceRef[]
  /** Timeline picks whose ref didn't resolve to the bundle (dropped, counted). */
  droppedTimelineCount: number
}

/** Deterministic coverage stats — zero AI, computed straight from the bundle. */
export interface SummaryCoverageStats {
  start?: string
  end?: string
  organizations: number
  encounters: number
  medications: number
  labs: number
  procedures: number
}

export function normaliseTimelineCategory(raw?: string): TimelineCategory {
  const c = (raw ?? '').toLowerCase().trim()
  return (TIMELINE_CATEGORIES as readonly string[]).includes(c)
    ? (c as TimelineCategory)
    : 'encounter'
}

export function normaliseProblemKind(raw?: string): ProblemKind {
  const c = (raw ?? '').toLowerCase().trim()
  return (PROBLEM_KINDS as readonly string[]).includes(c) ? (c as ProblemKind) : 'other'
}
