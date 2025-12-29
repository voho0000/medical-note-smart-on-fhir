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

export type ReportGroup = "lab" | "imaging" | "procedures" | "other"

export type Row = { 
  id: string
  title: string
  meta: string
  obs: Observation[]
  group: ReportGroup 
}
