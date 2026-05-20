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
  /** First (earliest) refill date for this drug, formatted. */
  firstRefillDate?: string
}
