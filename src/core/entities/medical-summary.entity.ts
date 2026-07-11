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

// Disease-oriented investigation overview. `kind` controls the icon/label;
// `direction` describes the CLINICAL direction (better/worse), not merely
// whether the raw number went up or down (e.g. falling eGFR = worsening).
export const INVESTIGATION_KINDS = ['lab', 'imaging', 'pathology', 'other'] as const
export type InvestigationKind = (typeof INVESTIGATION_KINDS)[number]

export const INVESTIGATION_DIRECTIONS = [
  'improving',
  'stable',
  'worsening',
  'fluctuating',
  'single',
  'unknown',
] as const
export type InvestigationDirection = (typeof INVESTIGATION_DIRECTIONS)[number]

// ---------------------------------------------------------------------------
// AI output schema (validated with Zod; malformed replies are rejected)
//
// Size caps CLAMP (slice/truncate), they never reject: verbose models (Claude
// Haiku especially) routinely exceed them with perfectly good content — a
// 27-segment narrative, 8 cited keys, an 85-char basis — and rejecting the
// whole reply for that made Haiku's parse-failure rate near-total (2026-07).
// Wrong TYPES and missing required fields still reject; oversize just trims.
// ---------------------------------------------------------------------------

const clampedText = (max: number) =>
  z.string().min(1).transform((s) => (s.length > max ? s.slice(0, max) : s))
const clampedKeys = (max: number) =>
  z.array(z.string()).optional().default([]).transform((a) => a.slice(0, max))

// One narrative segment. `emphasis` segments render as highlights; `sources`
// hold catalog keys (e.g. "E1") — never free-text citations.
export const SummarySegmentSchema = z.object({
  text: clampedText(400),
  emphasis: z.boolean().optional().default(false),
  sources: clampedKeys(6),
})

export const SummaryDecisionSchema = z.object({
  text: clampedText(400),
  urgency: z.enum(SUMMARY_URGENCIES),
  rationale: z.string().transform((s) => (s.length > 400 ? s.slice(0, 400) : s)).optional(),
  sources: clampedKeys(6),
})

// Timeline pick: the model only CHOOSES an event (by catalog key) and labels
// it. Lenient on category (off-list → coerced) like safety-alert categories.
export const TimelinePickSchema = z.object({
  ref: z.string().min(1),
  label: clampedText(200),
  category: z.string().optional(),
})

// Inferred active-problem list: the model synthesises problems from ALL data
// types (coded diagnoses, abnormal labs, dispensed meds, care plans, discharge
// summaries) — not just claim ICD codes — and cites the records via catalog keys.
// Deliberately NO ICD field: LLM-emitted codes proved unstable across runs
// (N18 / N18.3 / N18.9 for the same patient) and unverifiable codes must not
// look authoritative. The problem NAME + navigable sources are the product.
export const SummaryProblemSchema = z.object({
  label: clampedText(120),
  /** Short human-readable basis, e.g. "5 次檢驗異常" / "藥局調劑". */
  basis: z.string().transform((s) => (s.length > 80 ? s.slice(0, 80) : s)).optional(),
  /** What kind of evidence — drives the badge (off-list → 'other'). */
  kind: z.string().optional(),
  sources: clampedKeys(6),
})

// A compact, disease-relevant lab / imaging analysis. The model writes the
// human-readable trend from values that exist in the supplied clinical data;
// sources are resolved app-side so every row remains auditable/navigation-ready.
export const SummaryInvestigationSchema = z.object({
  label: clampedText(120),
  kind: z.string().optional(),
  direction: z.string().optional(),
  /** Data-first display, e.g. "HbA1c 7.2% → 8.4%" or an imaging finding. */
  trend: clampedText(240),
  /** One short, patient-specific interpretation of why the result matters. */
  interpretation: clampedText(400),
  sources: clampedKeys(8),
})

export const MedicalSummaryAiResultSchema = z.object({
  headline: clampedText(240),
  // Segment clamp is deliberately roomy (32, prompt asks for far fewer): it is
  // a runaway-output guard, not a style enforcer — trimming a narrative's tail
  // loses its conclusion, so only truly degenerate outputs should hit it.
  summary: z.array(SummarySegmentSchema).min(1).transform((a) => a.slice(0, 32)),
  investigations: z.array(SummaryInvestigationSchema).default([]).transform((a) => a.slice(0, 8)),
  problems: z.array(SummaryProblemSchema).default([]).transform((a) => a.slice(0, 20)),
  decisions: z.array(SummaryDecisionSchema).default([]).transform((a) => a.slice(0, 16)),
  // Patient complexity varies too much for an editorial cap — the prompt asks
  // the model to scale its picks to the case and the UI folds/scrolls any
  // count, so 50 exists purely to stop a degenerate (looping) reply.
  timeline: z.array(TimelinePickSchema).default([]).transform((a) => a.slice(0, 50)),
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

export interface SummaryInvestigation {
  label: string
  kind: InvestigationKind
  direction: InvestigationDirection
  trend: string
  interpretation: string
  sourceKeys: string[]
}

export interface MedicalSummaryResult {
  headline: string
  summary: Array<{ text: string; emphasis: boolean; sourceKeys: string[] }>
  investigations: SummaryInvestigation[]
  problems: SummaryProblem[]
  decisions: Array<{
    text: string
    urgency: SummaryUrgency
    rationale?: string
    sourceKeys: string[]
  }>
  timeline: SummaryTimelineEvent[]
  /** Unique cited sources in first-appearance order, matching the RENDER
   *  order (summary → investigations → problems → decisions) so superscript numbers read
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

export function normaliseInvestigationKind(raw?: string): InvestigationKind {
  const c = (raw ?? '').toLowerCase().trim()
  return (INVESTIGATION_KINDS as readonly string[]).includes(c)
    ? (c as InvestigationKind)
    : 'other'
}

export function normaliseInvestigationDirection(raw?: string): InvestigationDirection {
  const c = (raw ?? '').toLowerCase().trim()
  return (INVESTIGATION_DIRECTIONS as readonly string[]).includes(c)
    ? (c as InvestigationDirection)
    : 'unknown'
}
