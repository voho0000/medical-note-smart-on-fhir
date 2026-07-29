// Medications Types - Re-export from shared
import type {
  CodeableConcept,
  Quantity,
  Period,
  Duration,
  MedicationRequest,
  DosageInstruction,
} from '@/src/shared/types/fhir.types'

export type {
  CodeableConcept,
  Quantity,
  Period,
  Duration,
  MedicationRequest,
  DosageInstruction,
}

// Type aliases for backward compatibility
export type DurationLike = Duration
export type PeriodLike = Period
export type Medication = MedicationRequest

export interface MedicationRow {
  id: string
  title: string
  status: string
  dose?: string
  route?: string
  frequency?: string
  detail?: string
  startedOn?: string
  stoppedOn?: string
  durationDays?: number
  /** Computed end date: startedOn + durationDays (ISO date) */
  endDate?: string
  /** Days remaining until endDate (negative if already past) */
  daysRemaining?: number
  /** True if status is stopped/completed OR computed endDate has passed */
  isInactive: boolean
  /** True when FHIR courseOfTherapyType marks the order as 'continuous'
   *  (NHI 慢性處方箋, refillable chronic prescription). */
  isChronic: boolean
  /** Audience-aware drug-category label (e.g. "降血壓藥" or "HYPOTENSIVE AGENTS").
   *  Sourced from FHIR MedicationRequest.category[0]. Empty when no category
   *  is attached (older bundles or uncategorised one-off meds). */
  category?: string
  // ── Refill-history aggregate (derived across all MedicationRequests for
  //    this drug). Lets a single row surface compliance / adherence info
  //    without forcing the user to expand the per-drug accordion in the
  //    "Medication History" section.
  /** This refill's prescriber / dispensing pharmacy (requester.display). */
  pharmacy?: string
  /** ICD-10 code from this refill's reasonCode[0].coding[0].code. */
  icdCode?: string
  /** Human-readable ICD-10 description (text or display). */
  icdText?: string
  /** Total number of refills of this drug across the loaded dataset. */
  refillCount: number
  /** Number of EARLIER still-active fills of this same drug from the SAME
   *  institution merged into this row (慢箋 early refill overlap — one
   *  continuing prescription, not duplicate therapy). Cross-institution
   *  same-drug rows are never merged: that's a duplicate-therapy signal
   *  that must stay visible. Set by useGroupedMedications. */
  overlapCount?: number
  /** First (earliest) refill date for this drug, formatted. */
  firstRefillDate?: string
  /** Originating FHIR resource type. Bridge data is always undefined or
   *  'MedicationRequest'; IPS data uses 'MedicationStatement'. Drives the
   *  per-row source chip (only shown when the list is a mixed source). */
  sourceResourceType?: 'MedicationRequest' | 'MedicationStatement'
  /** Lowercased bilingual search blob: drug name (中文 + English) + NHI code +
   *  drug class (中/英) + indication ICD (碼 + 中/英) + 機構 + date tokens
   *  (西元 + 民國). Lets the 用藥 search match regardless of UI language. */
  searchHaystack: string
}
