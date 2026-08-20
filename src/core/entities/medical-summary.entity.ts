// Medical Summary (醫療摘要) — the FIXED, structured shape the AI must return so
// the UI renders固定卡片 instead of free-text markdown (same philosophy as
// safety-alert.entity.ts). The AI may ONLY cite data via reference keys taken
// from an app-built source catalog; dates / organizations / resource types are
// never AI output — they are resolved app-side from the FHIR bundle, which is
// what makes the timeline and source chips hallucination-proof.
import { z } from 'zod'
import type { SafetyScanResult } from './safety-alert.entity'

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

// Timeline v2 milestone categories. The v2 contract lets the model name the
// event kind directly (admission/emergency/careplan) instead of the generic
// 'encounter' + app-side class override; the legacy categories remain valid so
// pre-generated snapshots and cached results keep rendering unchanged.
export const TIMELINE_MILESTONE_CATEGORIES = [
  'admission',
  'emergency',
  'careplan',
  'exam',
  ...TIMELINE_CATEGORIES,
] as const
export type TimelineMilestoneCategory = (typeof TIMELINE_MILESTONE_CATEGORIES)[number]

export const CARE_THREAD_STATUSES = ['active', 'ended', 'interrupted'] as const
export type CareThreadStatus = (typeof CARE_THREAD_STATUSES)[number]

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

// Clinician-facing medication reconciliation. These labels describe the
// record state / workflow — deliberately not clinical risk severity, which
// belongs to the separate safety card.
export const MEDICATION_CHANGE_TYPES = [
  'new',
  'stopped',
  'resumed',
  'changed',
  'cross-facility',
  'uncertain',
] as const
export type MedicationChangeType = (typeof MEDICATION_CHANGE_TYPES)[number]

export const MEDICATION_RECONCILIATION_REASONS = [
  'status-conflict',
  'missing-sig',
  'multi-facility',
  'uncertain-current',
  'possible-same-drug',
  // A chronic medicine with no supporting diagnosis/lab anywhere in the data,
  // or an evidenced active condition with no corresponding therapy on the
  // current regimen. The latter is the one reconciliation item allowed to
  // cite non-Medication sources (there is no M key for an absent drug).
  'no-documented-indication',
  'condition-without-therapy',
  'supply-gap',
  'adherence-pattern',
  'other',
] as const
export type MedicationReconciliationReason = (typeof MEDICATION_RECONCILIATION_REASONS)[number]

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
export type DocumentEvidence = z.infer<typeof DocumentEvidenceSchema>
const optionalDocumentEvidence = () =>
  z.array(DocumentEvidenceSchema).max(4).optional()

// One narrative segment. `emphasis` segments render as highlights; `sources`
// hold catalog keys (e.g. "E1") — never free-text citations.
export const SummarySegmentSchema = z.object({
  text: clampedText(400),
  emphasis: z.boolean().optional().default(false),
  sources: clampedKeys(6),
  documentEvidence: optionalDocumentEvidence(),
})

export const SummaryDecisionSchema = z.object({
  text: clampedText(400),
  urgency: z.enum(SUMMARY_URGENCIES),
  rationale: z.string().transform((s) => (s.length > 400 ? s.slice(0, 400) : s)).optional(),
  sources: clampedKeys(6),
  documentEvidence: optionalDocumentEvidence(),
})

// Timeline pick: the model only CHOOSES an event (by catalog key) and labels
// it. Lenient on category (off-list → coerced) like safety-alert categories.
export const TimelinePickSchema = z.object({
  ref: z.string().min(1),
  label: clampedText(200),
  category: z.string().optional(),
  documentEvidence: optionalDocumentEvidence(),
})

// Timeline v2 milestone: one row may cover SEVERAL refs (an ER visit merged
// with its same-episode admission, or a recurrent same-cause series) — the
// coverage invariant is "no admission/ER/care-plan may silently disappear",
// enforced app-side at finalize, not "one row per event". Dates, day counts and
// organizations are still resolved app-side from the refs, never AI-written.
export const TimelineMilestoneSchema = z.object({
  refs: z.array(z.string().min(1)).min(1).transform((a) => a.slice(0, 40)),
  label: clampedText(200),
  category: z.string().optional(),
  note: z.string().transform((s) => (s.length > 200 ? s.slice(0, 200) : s)).optional(),
  documentEvidence: optionalDocumentEvidence(),
})
export type TimelineMilestonePick = z.infer<typeof TimelineMilestoneSchema>

// Care-thread RULE: the model describes recurring outpatient care as a
// matching rule (ICD prefixes × organizations) and the app expands it into
// member visits deterministically — the model never enumerates (or counts)
// visits, so there is nothing to miscount and every expanded member remains a
// real, navigable encounter.
export const CareThreadRuleSchema = z.object({
  label: clampedText(120),
  codePrefixes: z.array(z.string().min(2).transform((s) => s.slice(0, 8))).min(1).transform((a) => a.slice(0, 8)),
  organizations: z.array(z.string().min(1)).optional().default([]).transform((a) => a.slice(0, 8)),
  insight: z.string().transform((s) => (s.length > 200 ? s.slice(0, 200) : s)).optional(),
  status: z.string().optional(),
})
export type CareThreadRule = z.infer<typeof CareThreadRuleSchema>

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
  sources: clampedRequiredKeys(6),
  documentEvidence: optionalDocumentEvidence(),
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
  sources: clampedRequiredKeys(8),
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

const SummaryMedicationRegimenSchema = z.object({
  group: clampedText(80),
  name: clampedText(160),
  sig: z.string().transform((s) => (s.length > 240 ? s.slice(0, 240) : s)).optional(),
  sources: clampedRequiredKeys(8),
  documentEvidence: optionalDocumentEvidence(),
})

const SummaryMedicationChangeSchema = z.object({
  type: z.string().optional(),
  medication: clampedText(160),
  summary: clampedText(320),
  sources: clampedRequiredKeys(8),
  documentEvidence: optionalDocumentEvidence(),
})

const SummaryMedicationReconciliationItemSchema = z.object({
  reason: z.string().optional(),
  text: clampedText(320),
  sources: clampedRequiredKeys(8),
  documentEvidence: optionalDocumentEvidence(),
})

export const SummaryMedicationReviewSchema = z.object({
  /** 1–2 sentence clinician synthesis: burden (drug count / institutions),
   *  dominant treatment areas and who manages them, and the single most
   *  important pattern. Text-only — every fact must already be carried by a
   *  cited item elsewhere in the review. */
  overview: z.string().transform((s) => (s.length > 400 ? s.slice(0, 400) : s)).optional(),
  regimen: z.array(SummaryMedicationRegimenSchema).default([]).transform((a) => a.slice(0, 8)),
  changes: z.array(SummaryMedicationChangeSchema).default([]).transform((a) => a.slice(0, 5)),
  reconciliation: z.array(SummaryMedicationReconciliationItemSchema).default([]).transform((a) => a.slice(0, 5)),
})

export const MedicalSummaryAiResultSchema = z.object({
  headline: clampedText(240),
  // Segment clamp is deliberately roomy (32, prompt asks for far fewer): it is
  // a runaway-output guard, not a style enforcer — trimming a narrative's tail
  // loses its conclusion, so only truly degenerate outputs should hit it.
  summary: z.array(SummarySegmentSchema).min(1).transform((a) => a.slice(0, 32)),
  investigations: z.array(SummaryInvestigationSchema).default([]).transform((a) => a.slice(0, 8)),
  medicationEducation: z.array(SummaryMedicationEducationSchema).default([]).transform((a) => a.slice(0, 5)),
  medicationReview: SummaryMedicationReviewSchema.default({
    regimen: [],
    changes: [],
    reconciliation: [],
  }),
  problems: z.array(SummaryProblemSchema).default([]).transform((a) => a.slice(0, 20)),
  decisions: z.array(SummaryDecisionSchema).default([]).transform((a) => a.slice(0, 16)),
  // Patient complexity varies too much for an editorial cap — the prompt asks
  // the model to scale its picks to the case and the UI folds/scrolls any
  // count, so 50 exists purely to stop a degenerate (looping) reply.
  timeline: z.array(TimelinePickSchema).default([]).transform((a) => a.slice(0, 50)),
  milestones: z.array(TimelineMilestoneSchema).default([]).transform((a) => a.slice(0, 50)),
  threads: z.array(CareThreadRuleSchema).default([]).transform((a) => a.slice(0, 16)),
})
export type MedicalSummaryAiResult = z.infer<typeof MedicalSummaryAiResultSchema>

// The fixed summary is generated as independently validated modules. Keeping
// these ids in the domain layer lets generation, cache, orchestration, and UI
// agree on exactly which card failed without coupling those layers together.
export const MEDICAL_SUMMARY_MODULE_IDS = [
  'priorities',
  'problems',
  'timeline',
  'investigations',
  'medications',
] as const
export type MedicalSummaryModuleId = (typeof MEDICAL_SUMMARY_MODULE_IDS)[number]

export const MedicalSummaryPrioritiesModuleSchema = z.object({
  headline: clampedText(240),
  summary: z.array(SummarySegmentSchema).min(1).transform((a) => a.slice(0, 32)),
})
export const MedicalSummaryProblemsModuleSchema = z.object({
  problems: z.array(SummaryProblemSchema).default([]).transform((a) => a.slice(0, 20)),
})
export const MedicalSummaryTimelineModuleSchema = z.object({
  // Legacy single-ref picks: still accepted so cached results and demo
  // snapshots validate; new generations emit milestones + threads instead.
  timeline: z.array(TimelinePickSchema).default([]).transform((a) => a.slice(0, 50)),
  milestones: z.array(TimelineMilestoneSchema).default([]).transform((a) => a.slice(0, 50)),
  threads: z.array(CareThreadRuleSchema).default([]).transform((a) => a.slice(0, 16)),
})
export const MedicalSummaryInvestigationsModuleSchema = z.object({
  investigations: z.array(SummaryInvestigationSchema).default([]).transform((a) => a.slice(0, 8)),
})
export const MedicalSummaryMedicationsModuleSchema = z.object({
  medicationEducation: z.array(SummaryMedicationEducationSchema).default([]).transform((a) => a.slice(0, 5)),
  medicationReview: SummaryMedicationReviewSchema.default({
    regimen: [],
    changes: [],
    reconciliation: [],
  }),
})

export interface MedicalSummaryModuleResultMap {
  priorities: z.infer<typeof MedicalSummaryPrioritiesModuleSchema>
  problems: z.infer<typeof MedicalSummaryProblemsModuleSchema>
  timeline: z.infer<typeof MedicalSummaryTimelineModuleSchema>
  investigations: z.infer<typeof MedicalSummaryInvestigationsModuleSchema>
  medications: z.infer<typeof MedicalSummaryMedicationsModuleSchema>
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
  /** Encounter reason ICD codes (uppercased), deterministic from the bundle —
   *  lets care-thread rules (`codePrefixes`) expand at finalize without
   *  re-reading raw entities. */
  reasonCodes?: string[]
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
}

export interface SummaryTimelineEvent {
  key: string
  date: string
  /** Deterministic Encounter.period.end; omitted for point-in-time events. */
  endDate?: string
  label: string
  category: TimelineCategory
  organization?: string
  resourceType: string
  /** Bundle id of the underlying resource — lets the timeline row navigate
   *  the left panel to the raw resource (second evidence layer). */
  resourceId: string
  /** For category 'encounter': 住院/急診/門診, derived from Encounter.class. */
  encounterClass?: EncounterClass
  documentEvidence?: DocumentEvidence[]
}

/** Timeline v2 milestone resolved against the catalog. One row may cover
 *  several refs (merged episode / same-cause series); date range, orgs and
 *  navigation come from the bundle, only label/note/category from the AI. */
export interface SummaryMilestoneEvent {
  /** Verified catalog keys covered by this row (first = primary). */
  keys: string[]
  date: string
  endDate?: string
  label: string
  note?: string
  category: TimelineMilestoneCategory
  organizations: string[]
  /** Primary resource for row-click navigation. */
  resourceType: string
  resourceId: string
  encounterClass?: EncounterClass
  /** How many events this row covers (drives the ×N badge). */
  refCount: number
  /** True when the app appended this row because the model's reply failed the
   *  coverage invariant for this anchor — label falls back to catalog display. */
  coverageFallback?: boolean
  documentEvidence?: DocumentEvidence[]
}

/** A care thread expanded app-side from the model's rule. Members are real
 *  encounters, so counts/spans/dots are arithmetic, never AI claims. */
export interface SummaryCareThread {
  label: string
  insight?: string
  status: CareThreadStatus
  codePrefixes: string[]
  organizationFilter: string[]
  count: number
  first: string
  last: string
  organizations: Array<{ name: string; count: number }>
  visits: Array<{ date: string; organization?: string; resourceId: string }>
}

/** Deterministic header stats for the timeline card — straight from the
 *  catalog, zero AI. */
export interface SummaryTimelineStats {
  start?: string
  end?: string
  organizations: number
  admissions: number
  emergencies: number
  encounters: number
  /** First outpatient record date; when admissions predate it by >1 year the
   *  UI renders an honest "window boundary" marker (NHI 健康存摺 keeps a longer
   *  admission history than outpatient claim detail). */
  firstOutpatientDate?: string
}

export interface SummaryProblem {
  label: string
  basis?: string
  kind: ProblemKind
  sourceKeys: string[]
  /** Cited keys whose report type contradicts the evidence type the basis
   *  names (e.g. 依據:心電圖紀錄 citing a chest X-ray). Detected app-side at
   *  finalize; rendered amber — shown, not hidden — so the clinician knows to
   *  verify that citation instead of trusting the pill. */
  suspectSourceKeys?: string[]
  documentEvidence?: DocumentEvidence[]
}

export interface SummaryInvestigation {
  label: string
  kind: InvestigationKind
  direction: InvestigationDirection
  trend: string
  interpretation: string
  sourceKeys: string[]
  documentEvidence?: DocumentEvidence[]
}

export interface SummaryMedicationEducation {
  name: string
  benefit: string
  attention: string
  sourceKeys: string[]
  documentEvidence?: DocumentEvidence[]
}

export interface SummaryMedicationReview {
  overview?: string
  regimen: Array<{
    group: string
    name: string
    sig?: string
    sourceKeys: string[]
    documentEvidence?: DocumentEvidence[]
  }>
  changes: Array<{
    type: MedicationChangeType
    medication: string
    summary: string
    sourceKeys: string[]
    documentEvidence?: DocumentEvidence[]
  }>
  reconciliation: Array<{
    reason: MedicationReconciliationReason
    text: string
    sourceKeys: string[]
    documentEvidence?: DocumentEvidence[]
  }>
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
   * v15 results so streaming UI can distinguish completed empty cards from
   * cards that are still pending. Omitted legacy results are treated as
   * complete for backward-compatible rendering. */
  completedCardIds?: MedicalSummaryCardId[]
  /** Safety is a first-class generated card in the same briefing artifact,
   * not a separately validated or cached pipeline. */
  safety?: SafetyScanResult
  headline: string
  summary: Array<{
    text: string
    emphasis: boolean
    sourceKeys: string[]
    documentEvidence?: DocumentEvidence[]
  }>
  investigations: SummaryInvestigation[]
  medicationEducation: SummaryMedicationEducation[]
  medicationReview: SummaryMedicationReview
  problems: SummaryProblem[]
  decisions: Array<{
    text: string
    urgency: SummaryUrgency
    rationale?: string
    sourceKeys: string[]
    documentEvidence?: DocumentEvidence[]
  }>
  timeline: SummaryTimelineEvent[]
  /** Timeline v2: milestone rows (anchors + AI picks, multi-ref aggregation).
   *  When empty, the UI falls back to rendering legacy `timeline` picks. */
  milestones?: SummaryMilestoneEvent[]
  /** Timeline v2: recurring outpatient care expanded from AI rules. */
  careThreads?: SummaryCareThread[]
  /** Deterministic stats strip for the timeline card header. */
  timelineStats?: SummaryTimelineStats
  /** Unique cited sources in first-appearance order, matching the RENDER
   *  order (summary → investigations → medication card → problems → decisions) so superscript numbers read
   *  top-to-bottom on the page. */
  sourceIndex: ResolvedSourceRef[]
  /** Timeline picks whose ref didn't resolve to the bundle (dropped, counted). */
  droppedTimelineCount: number
}

export type MedicalSummaryGeneration = {
  source: 'live'
  modelId: string
  /** Immutable display name captured at generation time (especially
   * important for user-configured upstream model ids). */
  modelName: string
  /** When the structured summary itself finished. Also serves as the stable
   * identity used to attach app-authored batch metadata. */
  generatedAt: number
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

export function normaliseMilestoneCategory(raw?: string): TimelineMilestoneCategory {
  const c = (raw ?? '').toLowerCase().trim()
  return (TIMELINE_MILESTONE_CATEGORIES as readonly string[]).includes(c)
    ? (c as TimelineMilestoneCategory)
    : 'encounter'
}

export function normaliseCareThreadStatus(raw?: string): CareThreadStatus {
  const c = (raw ?? '').toLowerCase().trim()
  return (CARE_THREAD_STATUSES as readonly string[]).includes(c)
    ? (c as CareThreadStatus)
    : 'active'
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

export function normaliseMedicationChangeType(raw?: string): MedicationChangeType {
  const c = (raw ?? '').toLowerCase().trim()
  return (MEDICATION_CHANGE_TYPES as readonly string[]).includes(c)
    ? (c as MedicationChangeType)
    : 'uncertain'
}

export function normaliseMedicationReconciliationReason(raw?: string): MedicationReconciliationReason {
  const c = (raw ?? '').toLowerCase().trim()
  return (MEDICATION_RECONCILIATION_REASONS as readonly string[]).includes(c)
    ? (c as MedicationReconciliationReason)
    : 'other'
}
