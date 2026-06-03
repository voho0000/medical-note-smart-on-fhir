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
  /** Raw bridge report title (DiagnosticReport.code.text), BEFORE any
   *  audience/language display enhancement. `title` is the rendered string and
   *  may carry an appended abbreviation/translation (e.g. "心電圖 (ECG)");
   *  history lookups (useReportHistory) must key off this raw value so the
   *  exact match against DiagnosticReport.code.text still succeeds. */
  rawTitle?: string
  meta: string
  obs: Observation[]
  group: ReportGroup
  institution?: string
  effectiveDate?: string  // ISO date string for smart date display
  showTime?: boolean           // true when multiple same-name results share the same date
  isPossibleDuplicate?: boolean // true when same title+date+institution+value appears >1 time
}
