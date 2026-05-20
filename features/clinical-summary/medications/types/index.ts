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
}
