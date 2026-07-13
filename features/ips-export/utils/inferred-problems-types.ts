// IPS Phase 2.2 — types for LLM-inferred problem-list candidates.
//
// The IPS Problem List is usually near-empty because the NHI bridge only tags
// 重大傷病 as `problem-list-item` Conditions. Phase 2.2 lets an LLM synthesize a
// fuller active problem list from discharge summaries (出院病摘), outpatient ICD
// codes (門診 Encounter.reasonCode), medications, and corroborating lab/imaging.
//
// SAFETY: "aggressive" applies only to DIAGNOSIS INFERENCE (the clinical
// reasoning the model does). The problem list is TEXT-ONLY — the app never
// generates or attaches any SNOMED CT / ICD coding to an inferred problem.
// These are *suggestions*: nothing reaches the exported bundle until the user
// confirms it (per-item gating, plan decision).

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
  /** Model's self-rated *clinical-inference* confidence. */
  inferenceConfidence: 'high' | 'medium' | 'low'
  /** Evidence trail — enough for a clinician to verify the inference. */
  evidence: ProblemEvidence[]
  /** Optional one-line LLM rationale (shown in the disclosure). */
  rationale?: string
  /** Provenance of the candidate — drives the origin badge and gate copy:
   *   'summary'       Path A — imported from the Medical Summary problem list.
   *   'encounter-icd' deterministic import of recent Encounter.reasonCode ICD-10
   *                   codes (門診/就醫 ICD). These are BILLING codes, not
   *                   confirmed diagnoses — flagged 「非確診」 in the UI and, like
   *                   every candidate, default UNCHECKED behind the review gate.
   *   undefined       the original LLM-inference path (Path B). */
  origin?: 'summary' | 'encounter-icd'
  /**
   * REAL source coding carried by an `encounter-icd` candidate — the ICD-10 code
   * as it appeared in Encounter.reasonCode (system faithful to the source). This
   * is NOT an app-generated / LLM-guessed code; it flows into inferredToCondition
   * so a confirmed visit-ICD problem exports with its genuine ICD-10 coding.
   * Absent on text-only ('summary' / LLM) candidates, which stay code-free.
   */
  sourceCoding?: { system: string; code: string; display?: string }
}
