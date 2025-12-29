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
  isInactive: boolean
}
