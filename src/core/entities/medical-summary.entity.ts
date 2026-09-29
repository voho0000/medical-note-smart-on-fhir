import type { AiModelExecution } from '@/src/core/entities/ai-model-execution.entity'
// Medical Summary (醫療摘要) — the FIXED, structured shape the AI must return so
// the UI renders 初診快覽 instead of free-text markdown (same philosophy as
// safety-alert.entity.ts). The AI may ONLY cite data via reference keys taken
// from an app-built source catalog; dates / organizations / resource types are
// never AI output — they are resolved app-side from the FHIR bundle, which is
// what makes the recent-events list and source chips hallucination-proof.
import { z } from 'zod'
import type { SafetyScanResult } from './safety-alert.entity'

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

// 開藥前必看 slots. A fixed enum (rather than free text) is what lets the app
// keep at most one row per prescribing concern and render them in a stable
// order regardless of the order the model happened to emit.
export const MUST_KNOW_SLOTS = [
  'renal',
  'anticoagulation',
  'hematology',
  'high-risk-meds',
  'endocrine-pending',
  'other',
] as const
export type MustKnowSlot = (typeof MUST_KNOW_SLOTS)[number]

// ---------------------------------------------------------------------------
// AI output schema (validated with Zod; malformed replies are rejected)
//
// Size caps CLAMP (slice/truncate), they never reject: verbose models (Claude
// Haiku especially) routinely exceed them with perfectly good content — a
// long narrative, 8 cited keys, an 85-char basis — and rejecting the whole
// reply for that made Haiku's parse-failure rate near-total (2026-07).
// Wrong TYPES and missing required fields still reject; oversize just trims.
// ---------------------------------------------------------------------------

const clampedText = (max: number) =>
  z.string().min(1).transform((s) => (s.length > max ? s.slice(0, max) : s))
const optionalClampedText = (max: number) =>
  z.string().transform((s) => (s.length > max ? s.slice(0, max) : s)).optional()
const clampedRequiredKeys = (max: number) =>
  z.array(z.string().min(1)).min(1).transform((a) => a.slice(0, max))

// Verification-only metadata for claims translated or paraphrased from a
// free-text clinical document. The quote must remain in the document's
// original language so an offline checker can verify it without maintaining
// an unbounded bilingual dictionary of examinations, diagnoses, and findings.
export const DocumentEvidenceSchema = z.object({
  source: z.string().min(1),
  quote: clampedText(240),
})
export type DocumentEvidence = z.infer<typeof DocumentEvidenceSchema> & {
  /** App-authored excerpt check. Never establishes clinical entailment. */
  verification?: import('@/src/core/utils/document-evidence.utils').DocumentQuoteVerification
}
const optionalDocumentEvidence = () =>
  z.array(DocumentEvidenceSchema).max(4).optional()

// One 開藥前必看 row: `label` is the number or the fact ("eGFR 32"), `text` is
// the single sentence of consequence for prescribing today. Lenient on slot
// (off-list → coerced) like safety-alert categories.
//
// EVERY row cites at least one key. The one exception this schema used to make
// — the allergy row, which reported an ABSENT record and so had nothing to
// cite — is gone: the allergy row is now rendered by the app from the bundle's
// own AllergyIntolerance records, not asked of the model.
export const SummaryMustKnowSchema = z.object({
  slot: z.string().optional(),
  label: clampedText(40),
  text: clampedText(200),
  critical: z.boolean().optional(),
  sources: clampedRequiredKeys(6),
  documentEvidence: optionalDocumentEvidence(),
})

// One 最可能的就診主因 row. `flag` marks a concrete contradiction or gap the
// clinician has to verify — never mere uncertainty.
export const SummaryFocusSchema = z.object({
  title: clampedText(120),
  text: clampedText(400),
  flag: z.boolean().optional(),
  sources: clampedRequiredKeys(6),
  documentEvidence: optionalDocumentEvidence(),
})

// Recent-event pick: the model only CHOOSES an event (by catalog key) and
// labels it. Lenient on category (off-list → coerced).
export const TimelinePickSchema = z.object({
  ref: z.string().min(1),
  label: clampedText(200),
  category: z.string().optional(),
  documentEvidence: optionalDocumentEvidence(),
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
  basis: optionalClampedText(80),
  /** What kind of evidence — drives the badge (off-list → 'other'). */
  kind: z.string().optional(),
  /** Data-first key indicator, e.g. "eGFR 33 → 32 ▼". */
  metric: optionalClampedText(120),
  /** Dates/units belonging to `metric`, rendered as its meta line. */
  metricMeta: optionalClampedText(120),
  /** Organization + specialty as visible in the data (never invented). */
  managedBy: optionalClampedText(80),
  /** Catalog key of the latest encounter at that organization. The APP reads
   *  its date — the model never writes a date for this row. */
  managedByRef: z.string().optional(),
  medications: optionalClampedText(160),
  flag: z.boolean().optional(),
  sources: clampedRequiredKeys(6),
  documentEvidence: optionalDocumentEvidence(),
})

// Patient-facing medication education. This intentionally describes how a
// recorded medicine may support the patient's care before offering one calm,
// practical reminder. It is structured (rather than free markdown) so every
// item remains tied to the original medication record.
export const SummaryMedicationEducationSchema = z.object({
  name: clampedText(120),
  benefit: clampedText(400),
  attention: clampedText(400),
  sources: clampedRequiredKeys(8),
  documentEvidence: optionalDocumentEvidence(),
})

export const MedicalSummaryAiResultSchema = z.object({
  headline: clampedText(240),
  mustKnow: z.array(SummaryMustKnowSchema).default([]).transform((a) => a.slice(0, 8)),
  // Patient audience only; clinicians get mustKnow instead.
  medicationEducation: z.array(SummaryMedicationEducationSchema).default([]).transform((a) => a.slice(0, 5)),
  focus: z.array(SummaryFocusSchema).default([]).transform((a) => a.slice(0, 3)),
  problems: z.array(SummaryProblemSchema).default([]).transform((a) => a.slice(0, 20)),
  // Patient complexity varies too much for an editorial cap — the prompt asks
  // the model to scale its picks to the case and the UI folds/scrolls any
  // count, so 50 exists purely to stop a degenerate (looping) reply.
  recent: z.array(TimelinePickSchema).default([]).transform((a) => a.slice(0, 50)),
})
export type MedicalSummaryAiResult = z.infer<typeof MedicalSummaryAiResultSchema>

// The fixed summary is generated as independently validated modules. Keeping
// these ids in the domain layer lets generation, cache, orchestration, and UI
// agree on exactly which card failed without coupling those layers together.
// Order here is the streaming/presentation order of 初診快覽.
export const MEDICAL_SUMMARY_MODULE_IDS = [
  'overview',
  'focus',
  'problems',
  'recent',
] as const
export type MedicalSummaryModuleId = (typeof MEDICAL_SUMMARY_MODULE_IDS)[number]

export const MedicalSummaryOverviewModuleSchema = z.object({
  headline: clampedText(240),
  mustKnow: z.array(SummaryMustKnowSchema).default([]).transform((a) => a.slice(0, 8)),
  medicationEducation: z.array(SummaryMedicationEducationSchema).default([]).transform((a) => a.slice(0, 5)),
})
export const MedicalSummaryFocusModuleSchema = z.object({
  items: z.array(SummaryFocusSchema).default([]).transform((a) => a.slice(0, 3)),
})
export const MedicalSummaryProblemsModuleSchema = z.object({
  problems: z.array(SummaryProblemSchema).default([]).transform((a) => a.slice(0, 20)),
})
export const MedicalSummaryRecentModuleSchema = z.object({
  recent: z.array(TimelinePickSchema).default([]).transform((a) => a.slice(0, 50)),
})

export interface MedicalSummaryModuleResultMap {
  overview: z.infer<typeof MedicalSummaryOverviewModuleSchema>
  focus: z.infer<typeof MedicalSummaryFocusModuleSchema>
  problems: z.infer<typeof MedicalSummaryProblemsModuleSchema>
  recent: z.infer<typeof MedicalSummaryRecentModuleSchema>
}

export type MedicalSummaryModuleResult<T extends MedicalSummaryModuleId = MedicalSummaryModuleId> =
  MedicalSummaryModuleResultMap[T]

export const MEDICAL_SUMMARY_CARD_IDS = [
  ...MEDICAL_SUMMARY_MODULE_IDS,
  'safety',
] as const
export type MedicalSummaryCardId = (typeof MEDICAL_SUMMARY_CARD_IDS)[number]
export type MedicalSummaryCardErrors = Partial<Record<MedicalSummaryCardId, string>>

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
  /** ISO period end date taken from the resource. Currently populated for
   *  Encounter periods so admissions render their full stay deterministically. */
  endDate?: string
  organization?: string
  /** Whether the cited laboratory evidence itself contains an interpretation
   *  flag or reference range. A numeric value alone must not be described as
   *  high/low, controlled/uncontrolled, or at/not at target. */
  supportsNormalityAssessment?: boolean
  /** Lazy decoded document narrative, used only for claim-level verification.
   *  Kept out of prompts/source pills so large discharge summaries are not
   *  duplicated in memory or exposed as metadata. */
  getContentText?: () => string
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
  endDate?: string
  organization?: string
  /** Claim-specific verbatim excerpt used to pinpoint a cited free-text
   *  document. Never populated on the global source index; cards attach it
   *  while resolving the sources for one claim. */
  evidenceQuote?: string
  /** A resolved document may exist while its claim-specific quote is missing
   * or mismatched. Keep the original source navigable. */
  evidenceWarning?: 'missing' | 'mismatch' | 'unchecked'
}

export interface SummaryMustKnowItem {
  slot: MustKnowSlot
  label: string
  text: string
  critical: boolean
  sourceKeys: string[]
  documentEvidence?: DocumentEvidence[]
}

export interface SummaryFocusItem {
  title: string
  text: string
  flag: boolean
  sourceKeys: string[]
  documentEvidence?: DocumentEvidence[]
}

export interface SummaryRecentEvent {
  key: string
  date: string
  /** Deterministic Encounter.period.end; omitted for point-in-time events. */
  endDate?: string
  label: string
  category: TimelineCategory
  organization?: string
  resourceType: string
  /** Bundle id of the underlying resource — lets the row navigate the left
   *  panel to the raw resource (second evidence layer). */
  resourceId: string
  /** For category 'encounter': 住院/急診/門診, derived from Encounter.class. */
  encounterClass?: EncounterClass
  documentEvidence?: DocumentEvidence[]
}

export interface SummaryProblem {
  label: string
  basis?: string
  kind: ProblemKind
  metric?: string
  metricMeta?: string
  managedBy?: string
  /** Resolved app-side from `managedByRef` — the model never writes a date. */
  managedByDate?: string
  medications?: string
  flag?: boolean
  sourceKeys: string[]
  /** Cited keys whose report type contradicts the evidence type the basis
   *  names (e.g. 依據:心電圖紀錄 citing a chest X-ray). Detected app-side at
   *  finalize; rendered amber — shown, not hidden — so the clinician knows to
   *  verify that citation instead of trusting the pill. */
  suspectSourceKeys?: string[]
  documentEvidence?: DocumentEvidence[]
}

export interface SummaryMedicationEducation {
  name: string
  benefit: string
  attention: string
  sourceKeys: string[]
  documentEvidence?: DocumentEvidence[]
}

export interface MedicalSummaryResult {
  /** App-authored generation provenance. This is added only after the
   * structured AI reply has been parsed/finalized, so the model cannot claim a
   * different model or timestamp. Legacy caches may omit it; bundled demo
   * snapshots use explicit pre-generated provenance without a timestamp. */
  generation?: MedicalSummaryGeneration
  /** Per-card generation failures. Successful modules remain renderable and
   * cached; Retry regenerates only these ids. Missing means a legacy or fully
   * successful result. */
  cardErrors?: MedicalSummaryCardErrors
  /** Cards that have completed validation in this artifact. Present on live
   * results so streaming UI can distinguish completed empty cards from cards
   * that are still pending. Omitted legacy results are treated as complete for
   * backward-compatible rendering. */
  completedCardIds?: MedicalSummaryCardId[]
  /** Safety is a first-class generated card in the same briefing artifact,
   * not a separately validated or cached pipeline. High-severity alerts render
   * inside 開藥前必看; the rest fold into a closed disclosure. */
  safety?: SafetyScanResult
  headline: string
  mustKnow: SummaryMustKnowItem[]
  focus: SummaryFocusItem[]
  problems: SummaryProblem[]
  recent: SummaryRecentEvent[]
  medicationEducation: SummaryMedicationEducation[]
  /** Unique cited sources in first-appearance order, matching the RENDER
   *  order (mustKnow → medication education → focus → problems) so superscript
   *  numbers read top-to-bottom on the page. */
  sourceIndex: ResolvedSourceRef[]
  /** Recent-event picks dropped at finalize (unresolvable ref, or older than
   *  the 90-day window without being an admission/procedure). */
  droppedRecentCount: number
  /** Problems dropped at finalize because 最可能的就診主因 already covers them. */
  droppedProblemCount: number
  /** App-derived allergy row for 開藥前必看 — never the model's. An empty list
   *  means the bundle carries no AllergyIntolerance resource, which the UI must
   *  render as "the cloud record holds no allergy data", NOT as "no allergy".
   *  Optional only so a cached pre-redesign result still parses. */
  allergyRecords?: SummaryAllergyRecord[]
}

/** One AllergyIntolerance from the bundle, resolved to its catalog key so the
 *  row is navigable exactly like a cited source. */
export interface SummaryAllergyRecord {
  sourceKey: string
  label: string
  date?: string
}

export type MedicalSummaryGeneration = {
  source: 'live'
  modelId: string
  modelExecution?: AiModelExecution
  /** Provenance of the cards currently retained, including across partial retries. */
  cardModelExecutions?: Partial<Record<MedicalSummaryCardId, AiModelExecution>>
  /** Immutable display name captured at generation time (especially
   * important for user-configured upstream model ids). */
  modelName: string
  /** When the structured summary itself finished. Also serves as the stable
   * identity used to attach app-authored batch metadata. */
  generatedAt: number
  /** Milliseconds from the start of this generation to the moment its FIRST
   * card became visible. This is the number the 初診快覽 redesign is measured
   * on — a clinician has about thirty seconds — so it is recorded separately
   * from the end-to-end duration. Absent on legacy caches and on runs whose
   * cards all failed. */
  firstCardMs?: number
  /** When the complete user-visible summary + safety batch settled. Optional
   * for legacy caches and unsuccessful/incomplete batches. */
  completedAt?: number
  /** End-to-end user-visible generation batch duration. Optional for legacy
   * caches and unsuccessful/incomplete batches. */
  durationMs?: number
} | {
  source: 'pre-generated'
  modelId: string
  modelName: string
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

export function normaliseMustKnowSlot(raw?: string): MustKnowSlot {
  const c = (raw ?? '').toLowerCase().trim()
  return (MUST_KNOW_SLOTS as readonly string[]).includes(c) ? (c as MustKnowSlot) : 'other'
}
