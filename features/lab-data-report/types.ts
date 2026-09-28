// Wire contract for a clinician-initiated lab-data problem report. The same
// shape is re-validated by the `submitLabDataReport` Function
// (firebase-smart-on-fhir, functions/src/services/lab-data-report); change
// both sides together and bump LAB_DATA_REPORT_SCHEMA_VERSION.
//
// What is deliberately absent: patient identity, FHIR resource ids, absolute
// dates, Observation.note, report narrative, and anything that is not a
// laboratory Observation. See PRIVACY_POLICY.md §2.10.
import type { LabCategoryDecision } from '@/src/shared/utils/lab-categories'

export type { LabCategoryDecision }

export const LAB_DATA_REPORT_SCHEMA_VERSION = 1

/** A report carries every laboratory row of the patient's cumulative report.
 *  Real patients carry up to ~1,400 (2026-09-27, 278 bundles); past this cap
 *  the flagged panels are kept whole and the oldest other rows are counted in
 *  `truncatedRows`. */
export const LAB_DATA_REPORT_MAX_ROWS = 3000
export const LAB_DATA_REPORT_MAX_DESCRIPTION = 1000
/** A source result string longer than this is narrative and is never sent. */
export const LAB_DATA_REPORT_MAX_VALUE_STRING = 40
/** Reference-range text longer than this is narrative and is never sent. */
export const LAB_DATA_REPORT_MAX_RANGE_TEXT = 120
/** Hard cap for any other row string (names, units, codes). */
export const LAB_DATA_REPORT_MAX_STRING = 200

/** The one-tap choices. Picking one is optional — a busy clinic reports in
 *  seconds, and the rows themselves show what went wrong. */
export const LAB_DATA_REPORT_PROBLEM_TYPES = [
  'wrong-panel',
  'split-column',
  'duplicate',
  'value-unit',
  'name',
  'other',
] as const
export type LabDataReportProblemType = (typeof LAB_DATA_REPORT_PROBLEM_TYPES)[number] | 'unspecified'

export const LAB_DATA_REPORT_DATA_SOURCES = ['medcloud', 'nhi', 'smart', 'demo', 'import', 'unknown'] as const
export type LabDataReportDataSource = (typeof LAB_DATA_REPORT_DATA_SOURCES)[number]

export type LabDataReportValue =
  /** `value`/`comparator` only when the reporter chose to attach values. */
  | { kind: 'quantity'; value?: number; comparator?: string; magnitude: number | null; decimals: number }
  | { kind: 'range'; low?: number; high?: number }
  | { kind: 'coded'; code?: string; text?: string }
  | { kind: 'string'; value?: string; length: number }
  | { kind: 'other'; type: string }
  | { kind: 'none' }

export interface LabDataReportCoding {
  system?: string
  code?: string
  display?: string
}

export interface LabDataReportReferenceRange {
  low?: number
  high?: number
  unit?: string
  text?: string
}

export interface LabDataReportRow {
  /** Ordinal inside this report (1-based); never a FHIR id. */
  ref: number
  /** Days since the earliest dated row in this report (day 0). */
  day: number | null
  /** Local time of day from effectiveDateTime, when the source carried one. */
  timeOfDay?: string
  /** MediCloud report-instance time, relative to this row's day. Decides
   *  whether the bridge merges a daily and a monthly copy. */
  sourceTime?: { dayDelta: number; time: string }
  /** Performing organisation(s) as the source labelled them (not the patient). */
  performer: string[]
  code: { text?: string; codings: LabDataReportCoding[] }
  category: string[]
  specimen?: string
  status?: string
  unit?: string
  unitCode?: string
  value: LabDataReportValue
  /** Rows whose result is identical share a group number. */
  sameValueGroup?: number
  interpretation: string[]
  referenceRange: LabDataReportReferenceRange[]
  /** Whitelisted bridge extensions (source category, inspect mode, data mark,
   *  copy count …), by short name. */
  sourceExtensions: { name: string; value: string }[]
  /** Whitelisted meta.tag entries as `name:code`. Never nhi-visit-date. */
  sourceTags: string[]
  /** What the app did with the row. */
  app: {
    categoryId: string | null
    decidedBy: LabCategoryDecision
    testKey: string
    column: string
  }
}

export interface LabDataReportContext {
  appVersion: string
  dataSource: LabDataReportDataSource
  site: 'vghtpe' | 'unknown'
  language: string
  nameMode: 'standardized' | 'original'
}

export interface LabDataReportPayload {
  schemaVersion: typeof LAB_DATA_REPORT_SCHEMA_VERSION
  problemType: LabDataReportProblemType
  description: string
  includesValues: boolean
  scope: {
    /** Panels the reporter ticked as looking wrong (optional, several allowed). */
    flaggedCategories: string[]
    /** Rows sent per panel, in the clinician's panel order. */
    categories: Array<{ categoryId: string; rows: number }>
  }
  context: LabDataReportContext
  rows: LabDataReportRow[]
  /** Rows left out by the row cap. */
  truncatedRows: number
  /** Rows shown in a lab panel whose FHIR category is not laboratory. */
  excludedNonLabRows: number
  /** Row strings removed because they looked like an identifier or date. */
  droppedStrings: number
}

export interface LabDataReportResponse {
  success: boolean
  reportId?: string
  error?: string
  reason?: string
}
