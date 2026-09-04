// Lab Reports Category — presented as a per-analyte TIME SERIES so the AI can
// see trends (e.g. Creatinine 1.2 → 1.5 → 2.0 = worsening renal function).
// Lab values are intentionally NOT scattered under each visit in the encounter
// view; the trend lives here, in one place, undivided.
//
// The line shape and the reasoning behind it live in
// src/core/utils/lab-series-context.utils.ts. In short, one line per analyte:
// latest value + unit + date + abnormal flag, then the readings before it up to
// the `labDepth` cap, then — only when the cap actually hid something — a
// lossless `range … span … n=` tail. Widening the time range therefore adds
// facts to existing lines instead of adding rows.
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { DiagnosticReport, Observation } from '@/src/shared/types/fhir.types'
import { inferGroupFromCategory } from '@/src/shared/utils/report-grouping-helpers'
import { selectLabOrphanObservations } from '@/src/core/utils/observation-selectors'
import { makeTimeRangeTest } from '../utils/date-filter.utils'
import { categorizeObservation } from '@/src/shared/utils/lab-categories'
import {
  labStatusSuffix,
  renderLabSeriesItems,
  type LabSeriesPoint,
} from '@/src/core/utils/lab-series-context.utils'
import { expandObservationValues, observationDisplayValue } from '@/src/core/utils/observation-value.utils'
import { normalizeClinicalStatus } from '@/src/core/utils/clinical-context-selection.utils'

// Union type for lab data (DiagnosticReport or standalone Observation)
type LabData = DiagnosticReport | Observation

// Cap the readings rendered per analyte to keep the context bounded; anything
// older is summarised losslessly by the series' `range … n=` tail rather than
// dropped. User-tunable via the labDepth filter ('latest' = 1 point;
// '3'/'8'/'16' = cap K; 'all' = uncapped).
const DEFAULT_TREND_POINTS = 8

// Readings rendered per analyte, derived from labDepth. 'latest' → 1;
// 'all' → uncapped (Infinity); '3'/'8'/'16' → that many.
function trendPointsFrom(filters?: Record<string, unknown>): number {
  const depth = String(filters?.labDepth ?? '')
  if (depth === 'all') return Number.POSITIVE_INFINITY
  if (depth === 'latest') return 1
  const n = Number(depth)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TREND_POINTS
}

// When falling back outside the time window, keep the most recent N distinct
// sampling days rather than everything.
const FALLBACK_SAMPLING_DAYS = 3

function isObservation(item: LabData): item is Observation {
  return (item as any).resourceType === 'Observation'
    || !!observationDisplayValue(item)
    || Array.isArray((item as Observation).component)
}

interface LabPoint {
  name: string
  unit: string
  value: string
  date?: string
  interp?: string
  status?: string
  /** Owning lab panel id (cbc/chem/…) for panel-level sub-selection; '' if unknown. */
  panel: string
  /** Source observation — feeds the pivot builder for panel-categorized points. */
  obs: any
}

function obsToLabPoint(o: any): LabPoint | null {
  const name = o?.code?.text || o?.code?.coding?.[0]?.display || 'Lab'
  const display = observationDisplayValue(o)
  if (!display || display.value === '') return null
  const value = display.value
  const unit = display.unit || ''
  const date = o?.effectiveDateTime
  const interp = o?.interpretation?.coding?.[0]?.code || o?.interpretation?.text || undefined
  const panel = categorizeObservation(o)?.id ?? ''
  const status = normalizeClinicalStatus(o?.status) || undefined
  return {
    name,
    unit,
    value,
    date,
    interp,
    status,
    panel,
    obs: o,
  }
}

/** Parse the labPanelIds CSV filter into a Set; empty Set = no restriction. */
function parsePanelFilter(filters?: Record<string, unknown>): Set<string> {
  const csv = String(filters?.labPanelIds ?? '')
  return new Set(csv.split(',').map((s) => s.trim()).filter(Boolean))
}

interface NarrativeReport {
  text: string
  date?: string
  status?: string
}

// Flatten lab data into individual analyte readings (+ narrative conclusions for
// reports with no numeric results, e.g. microbiology / pathology).
function collectLabPoints(
  data: LabData[],
  allObservations: Observation[],
): { points: LabPoint[]; conclusions: NarrativeReport[] } {
  const points: LabPoint[] = []
  const conclusions: NarrativeReport[] = []

  for (const item of data) {
    if (isObservation(item)) {
      if (normalizeClinicalStatus((item as any).status) === 'entered-in-error') continue
      for (const valueObservation of expandObservationValues(item)) {
        const p = obsToLabPoint(valueObservation)
        if (p) points.push(p)
      }
      continue
    }

    const report = item as DiagnosticReport
    if (normalizeClinicalStatus(report.status) === 'entered-in-error') continue
    const resolved = (report.result ?? [])
      .map((r: any) => {
        const id = r?.reference?.split('/').pop()
        return id ? allObservations.find((o) => o.id === id) : undefined
      })
      .filter(Boolean) as Observation[]

    let added = 0
    for (const o of resolved) {
      if (normalizeClinicalStatus((o as any).status) === 'entered-in-error') continue
      for (const valueObservation of expandObservationValues(o)) {
        const p = obsToLabPoint(valueObservation)
        if (p) {
          points.push(p)
          added++
        }
      }
    }
    if (added === 0 && report.conclusion) {
      conclusions.push({
        text: `${report.code?.text || 'Report'}: ${report.conclusion}`,
        date: report.effectiveDateTime || report.issued,
        status: normalizeClinicalStatus(report.status) || undefined,
      })
    }
  }

  return { points, conclusions }
}

const shortDate = (d?: string): string => (d ? d.slice(0, 10) : '')

// ── Series rendering ────────────────────────────────────────────────────────
// The per-analyte series lives in src/core/utils/lab-series-context.utils.ts.
// It keeps the source-faithful abnormal policy the cumulative report uses
// (formatValue → isObservationAbnormal) and the shared panel taxonomy, so the
// flags and grouping here match every other lab surface in the app.
//
// History note: this section used to render a date × test markdown pivot plus a
// duplicated "Key trends" appendix (docs/LAB-FORMAT-EXPERIMENT-2026-07-12.md).
// The appendix restated the table verbatim, and the table itself paid for a
// cell per analyte per date whether or not that analyte was drawn — neither
// survives a widened time range. The series carries the same facts, plus a
// min/max/count tail for everything the depth cap hides.

const UNKNOWN_FINALITY_NOTE =
  'Note: laboratory report finality status is unavailable in the source cloud record.'

function toSeriesPoints(points: LabPoint[]): LabSeriesPoint[] {
  return points.map((point) => ({
    name: point.name,
    unit: point.unit,
    value: point.value,
    date: point.date,
    status: point.status,
    panel: point.panel,
    observation: point.obs,
  }))
}

interface WindowedLabs {
  points: LabPoint[]
  conclusions: NarrativeReport[]
  /** Set when the window was empty and we fell back to recent sampling days. */
  fallbackDays: number
}

// Apply the time window with a recent-sampling-days FLOOR: labs are the most
// unevenly distributed category (a stable patient's last panel may predate any
// wall-clock window), so the most recent FALLBACK_SAMPLING_DAYS distinct
// sampling days are always included, whether or not the window caught anything.
// getCount and getContextSection share this so the badge matches the context.
//
// It is a floor, not an alternative. When the fallback only fired on a
// COMPLETELY empty window, a window that happened to catch one stray reading
// suppressed it entirely — so widening the range could REMOVE analytes: a
// patient whose last full panel predates the range but who has one isolated
// later reading rendered 16 analyte lines at 6m (empty → fallback) and 4 at 3y
// (one stray reading → no fallback), hiding the most recent real panel. As a
// floor the result is monotone in the range: widening can only ever add.
// Because the floor days are the most recent ones overall, they are already
// inside any window that reaches current data, so a normally-populated chart is
// unaffected.
function applyLabWindow(
  points: LabPoint[],
  conclusions: NarrativeReport[],
  range: string,
  allClinicalData: unknown,
): WindowedLabs {
  if (range === 'all' || range === '') {
    return { points, conclusions, fallbackDays: 0 }
  }
  const inWindow = makeTimeRangeTest(range, allClinicalData as { encounters?: [] } | null)
  const inRangePoints = points.filter((p) => inWindow(p.date))
  const inRangeConclusions = conclusions.filter((c) => inWindow(c.date))

  // The most recent distinct sampling days across all of history — the floor.
  const days = [
    ...new Set(
      [...points.map((p) => p.date), ...conclusions.map((c) => c.date)]
        .filter(Boolean)
        .map((d) => (d as string).slice(0, 10)),
    ),
  ]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, FALLBACK_SAMPLING_DAYS)
  const daySet = new Set(days)
  const onDays = (d?: string): boolean => !!d && daySet.has(d.slice(0, 10))

  const keptPoints = points.filter((p) => inWindow(p.date) || onDays(p.date))
  const keptConclusions = conclusions.filter((c) => inWindow(c.date) || onDays(c.date))

  // Only report a fallback when the floor actually contributed readings the
  // window did not already hold — otherwise the note would claim a widening
  // that never happened.
  const addedPoints = keptPoints.length - inRangePoints.length
  const addedConclusions = keptConclusions.length - inRangeConclusions.length
  const fallbackDays = addedPoints > 0 || addedConclusions > 0
    ? days.filter((day) => !inWindow(day)).length
    : 0

  return { points: keptPoints, conclusions: keptConclusions, fallbackDays }
}

export const labReportsCategory: DataCategory<LabData> = {
  id: 'labReports',
  label: 'Lab Reports',
  labelKey: 'dataSelection.labReports',
  description: 'Laboratory test results and panels',
  descriptionKey: 'dataSelection.labReportsDesc',
  group: 'reports',
  order: 40,

  filters: [
    {
      // 每項目筆數 — 一顆下拉合併舊的「檢驗版本」+「趨勢深度」。'latest' = 每項目
      // 最新 1 筆;'3'/'8'/'16' = 樞紐每項目上限 K;'all' = 每項目全部、不設上限。
      key: 'labDepth',
      type: 'select',
      label: 'Points per test',
      options: [
        { value: 'latest', label: 'Latest (1)' },
        { value: '3', label: '3 per test' },
        { value: '8', label: '8 per test' },
        { value: '16', label: '16 per test' },
        { value: 'all', label: 'All' },
      ],
      defaultValue: '8',
    },
    {
      key: 'labReportTimeRange',
      type: 'select',
      label: 'Time Range',
      options: [
        { value: '1w', label: 'Last Week' },
        { value: '1m', label: 'Last Month' },
        { value: '3m', label: 'Last 3 Months' },
        { value: '6m', label: 'Last 6 Months' },
        { value: '1y', label: 'Last Year' },
        { value: 'sinceLastVisit', label: 'Since last visit' },
        { value: 'all', label: 'All Time' },
      ],
      defaultValue: '6m',
    },
  ],

  filterComponentKey: 'labReport',

  extractData: (clinicalData) => {
    // Lab DiagnosticReports + standalone lab observations. The standalone-obs
    // dedup (skip any observation already attached to a report) lives in the
    // shared SSOT selector — see src/core/utils/observation-selectors.ts.
    const reports = clinicalData?.diagnosticReports || []
    const labReports = reports.filter((report: DiagnosticReport) =>
      inferGroupFromCategory(report.category) === 'lab'
    )
    const standaloneResultObs = selectLabOrphanObservations(clinicalData)
    return [...labReports, ...standaloneResultObs] as unknown as LabData[]
  },

  // Count source readings in the selected window. Rendering may group same-day
  // readings into one cell and labDepth may cap the visible points per analyte;
  // the coverage manifest labels these as source-record counts explicitly.
  getCount: (data, filters, allClinicalData) => {
    const { points, conclusions } = collectLabPoints(data, allClinicalData?.observations || [])
    const range = (filters?.labReportTimeRange as string) || 'all'
    const windowed = applyLabWindow(points, conclusions, range, allClinicalData)
    const panels = parsePanelFilter(filters)
    const kept = panels.size === 0
      ? windowed.points
      : windowed.points.filter((p) => panels.has(p.panel))
    const depth = (filters?.labDepth as string) || 'latest'
    if (depth === 'latest') return new Set(kept.map((p) => p.name)).size
    return kept.length
  },

  getContextSection: (data, filters, allClinicalData): ClinicalContextSection | null => {
    if (data.length === 0) return null

    const range = (filters?.labReportTimeRange as string) || 'all'
    const depth = (filters?.labDepth as string) || 'latest'
    const maxTrendPoints = trendPointsFrom(filters)
    const { points, conclusions } = collectLabPoints(data, allClinicalData?.observations || [])

    const windowed = applyLabWindow(points, conclusions, range, allClinicalData)
    // Panel sub-selection: restrict analytes to the chosen panels. Narrative
    // conclusions (micro/path) are NOT panel-tagged, so they always pass — a
    // panel filter is an analyte-level refinement, not a way to hide reports.
    const panels = parsePanelFilter(filters)
    const inRange = panels.size === 0
      ? windowed.points
      : windowed.points.filter((p) => panels.has(p.panel))

    // One line per analyte, grouped by panel. `latest` is just the depth-1 case
    // of the same renderer, so the two depths can no longer drift apart in
    // labelling, flags or ordering.
    const items = renderLabSeriesItems(toSeriesPoints(inRange), maxTrendPoints)

    // Narrative reports without numeric results (microbiology / pathology).
    const inRangeConclusions = windowed.conclusions
    if (inRangeConclusions.length > 0) {
      if (items.length > 0) items.push('')
      inRangeConclusions
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach((c) => {
          const status = labStatusSuffix(c.status)
          items.push(`${c.text}${status}${c.date ? ` (${shortDate(c.date)})` : ''}`)
        })
    }

    if (items.length === 0) return null

    const hasUnknownFinality = inRange.some((point) => point.status === 'unknown')
      || inRangeConclusions.some((conclusion) => conclusion.status === 'unknown')
    if (hasUnknownFinality) {
      items.unshift(UNKNOWN_FINALITY_NOTE, '')
    }

    if (windowed.fallbackDays > 0) {
      items.unshift(
        `Note: the most recent ${windowed.fallbackDays} sampling day(s) predate the selected time range and are shown anyway, so the latest available panel is not hidden.`,
        '',
      )
    }

    const title = depth === 'latest'
      ? 'Lab Reports (latest value per test, grouped by panel; abnormal flagged H/L/*)'
      : 'Lab Reports (per-analyte series by panel: latest | prior values | range/n of hidden history; abnormal flagged H/L/*)'
    return { title, items }
  },
}
