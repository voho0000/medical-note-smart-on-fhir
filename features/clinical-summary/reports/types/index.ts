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
  /** ──── Multi-region study grouping (NHI 33xxxB CT etc.) ────────────
   *  NHI bills every body part imaged on the same machine under one
   *  health-record code. When the same (code, date, institution) carries
   *  multiple DRs — some narrative-only, some image-only — bridge can't
   *  pair them (no body_part field in IHKE3408) and the SMART app must
   *  display the group together with an ambiguity warning. A synthetic
   *  row carrying `groupedRows` is rendered as MultiRegionStudyCard
   *  instead of the regular ReportRow. */
  groupedRows?: Row[]
  /** True when the group has ≥2 narrative-only DRs (multi-region) OR
   *  ≥1 narrative + ≥1 image-only with total >2 (mixed ambiguous set).
   *  Drives the warning banner in MultiRegionStudyCard. Bridge spec
   *  §"hasAmbiguousAssociation" defines the rule. */
  hasAmbiguity?: boolean
  /** Number of DR duplicates bridge sent for this row that we collapsed
   *  via strict-prefix dedup. Drives the "bridge dup × N" badge on the
   *  row header so the bridge bug stays visible — silently merging would
   *  violate the no-mask-bridge-bugs rule. Absent / 0 means no dup. */
  bridgeDupCount?: number
}
