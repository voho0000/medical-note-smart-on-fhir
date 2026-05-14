// Types for Reports - Re-export from shared types
import type { Observation } from '@/src/shared/types/fhir.types'

export type {
  Coding,
  Quantity,
  CodeableConcept,
  ReferenceRange,
  Observation,
  DiagnosticReport,
  Procedure,
} from '@/src/shared/types/fhir.types'

export type ReportGroup = "lab" | "imaging" | "procedures" | "vitals" | "other"

export type Row = {
  id: string
  title: string
  meta: string
  obs: Observation[]
  group: ReportGroup
  institution?: string
  effectiveDate?: string  // ISO date string for smart date display
  showTime?: boolean           // true when multiple same-name results share the same date
  isPossibleDuplicate?: boolean // true when same title+date+institution+value appears >1 time
}
