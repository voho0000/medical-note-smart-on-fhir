// IPS Phase 2.2 — types for LLM-inferred problem-list candidates.
//
// The IPS Problem List is usually near-empty because the NHI bridge only tags
// 重大傷病 as `problem-list-item` Conditions. Phase 2.2 lets an LLM synthesize a
// fuller active problem list from discharge summaries (出院病摘), outpatient ICD
// codes (門診 Encounter.reasonCode), medications, and corroborating lab/imaging.
//
// SAFETY: "aggressive" applies only to DIAGNOSIS INFERENCE (the clinical
// reasoning the model does). SNOMED CODING always passes the verified-allowlist
// ladder (see snomed-mapping.ts) — an LLM-generated SNOMED id is never trusted
// blindly. These are *suggestions*: nothing reaches the exported bundle until the
// user confirms it (per-item gating, plan decision).

import type { ConditionSctAnnotation } from './snomed-mapping'

/** Which rung of the coding ladder produced an inferred problem's SNOMED code. */
export type CodingStrategy =
  | 'B' // anchored to an evidence ICD-10 that hit the verified allowlist → high
  | 'C' // LLM picked a code FROM the verified allowlist → medium-high
  | 'A' // LLM free-generated, not in the allowlist → low + needsManualCoding
  | 'none' // no SNOMED assigned (ICD/text-only problem)

/** Where a piece of supporting evidence came from (for clinician audit). */
export type EvidenceKind = 'encounter-icd' | 'medication' | 'discharge-excerpt' | 'lab' | 'composition'

/** One piece of evidence backing an inferred problem. */
export interface ProblemEvidence {
  kind: EvidenceKind
  /** Human-readable, locale-where-possible label (e.g. "E11.9 第二型糖尿病"). */
  label: string
  /** Source resource id when available (Encounter / Medication / DocumentReference / Observation). */
  sourceId?: string
  /** ICD-10 for `encounter-icd` evidence — this is what feeds Strategy B. */
  icd10?: string
  /** ISO date of the source event (recency display). */
  date?: string
  /** For `encounter-icd`: how many visits carried this ICD (frequency display). */
  count?: number
}

/** An LLM-inferred candidate problem awaiting human confirmation. */
export interface InferredProblem {
  /** Stable id within one inference run (React key + confirmation key). */
  id: string
  /** Normalized diagnosis labels. */
  labelZh: string
  labelEn: string
  /** Model's self-rated *clinical-inference* confidence (separate from coding confidence). */
  inferenceConfidence: 'high' | 'medium' | 'low'
  /** Coding result via the B/C/A ladder. null = no SNOMED assigned (text/ICD only). */
  coding: ConditionSctAnnotation | null
  /** Which ladder rung produced `coding`. */
  strategy: CodingStrategy
  /** True when the SNOMED code must be manually reviewed (Strategy A). Mirrors coding.needsManualCoding. */
  needsManualCoding: boolean
  /** Evidence trail — enough for a clinician to verify the inference. */
  evidence: ProblemEvidence[]
  /** Optional one-line LLM rationale (shown in the disclosure). */
  rationale?: string
}
