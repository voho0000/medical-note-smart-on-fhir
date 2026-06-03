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

/** Image attachment from DiagnosticReport.presentedForm (bridge v0.14.0+).
 *  Decoded to a Blob URL lazily by the viewer (ReportImageDialog), never
 *  eagerly. Carries exactly one source:
 *   - `ref`:  IndexedDB Blob key (local-bundle import path — base64 moved
 *             off-heap at import; bytes fetched on demand via getImage).
 *   - `data`: raw base64 inline (SMART live path — images still arrive inline). */
export type ReportImage = {
  ref?: string
  data?: string
  contentType: string
  title?: string
  size?: number
}

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
  images?: ReportImage[]        // inline base64 images (presentedForm); rendered on demand
}
