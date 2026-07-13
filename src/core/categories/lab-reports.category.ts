// Lab Reports Category — presented as a per-analyte TIME SERIES so the AI can
// see trends (e.g. Creatinine 1.2 → 1.5 → 2.0 = worsening renal function).
// Lab values are intentionally NOT scattered under each visit in the encounter
// view; the trend lives here, in one place, undivided.
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { DiagnosticReport, Observation } from '@/src/shared/types/fhir.types'
import { inferGroupFromCategory } from '@/src/shared/utils/report-grouping-helpers'
import { selectStandaloneResultObservations } from '@/src/core/utils/observation-selectors'
import { formatNumberSmart } from '@/src/shared/utils/number-format.utils'
import { makeTimeRangeTest } from '../utils/date-filter.utils'
import { categorizeObservation } from '@/src/shared/utils/lab-categories'
import { buildLabPivots, type LabPivot, type LabRow } from '@/src/shared/utils/lab-pivot.utils'

// Union type for lab data (DiagnosticReport or standalone Observation)
type LabData = DiagnosticReport | Observation

// Cap the trend at the most recent N readings per analyte to keep the context
// bounded; older points are summarised as "…(N earlier)". User-tunable via the
// labDepth filter ('3'/'8'/'16' = cap K; 'all' = uncapped).
const DEFAULT_TREND_POINTS = 8

// Max trend points per analyte for the pivot / trend-line rendering, derived
// from labDepth. 'all' → uncapped (Infinity); '3'/'8'/'16' → that many; the
// 'latest' depth uses a separate compact branch and never reads this.
function trendPointsFrom(filters?: Record<string, unknown>): number {
  const depth = String(filters?.labDepth ?? '')
  if (depth === 'all') return Number.POSITIVE_INFINITY
  const n = Number(depth)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TREND_POINTS
}

// When falling back outside the time window, keep the most recent N distinct
// sampling days rather than everything.
const FALLBACK_SAMPLING_DAYS = 3

function isObservation(item: LabData): item is Observation {
  return (item as any).resourceType === 'Observation' || !!(item as Observation).valueQuantity || !!(item as Observation).valueString
}

interface LabPoint {
  name: string
  unit: string
  value: string
  date?: string
  interp?: string
  /** Owning lab panel id (cbc/chem/…) for panel-level sub-selection; '' if unknown. */
  panel: string
  /** Source observation — feeds the pivot builder for panel-categorized points. */
  obs: any
}

function obsToLabPoint(o: any): LabPoint | null {
  const name = o?.code?.text || o?.code?.coding?.[0]?.display || 'Lab'
  const raw = o?.valueQuantity?.value ?? o?.valueString
  if (raw === undefined || raw === null || raw === '') return null
  const value = typeof raw === 'number' ? formatNumberSmart(raw) : String(raw)
  const unit = o?.valueQuantity?.unit || ''
  const date = o?.effectiveDateTime
  const interp = o?.interpretation?.coding?.[0]?.code || o?.interpretation?.text || undefined
  const panel = categorizeObservation(o)?.id ?? ''
  return { name, unit, value, date, interp, panel, obs: o }
}

/** Parse the labPanelIds CSV filter into a Set; empty Set = no restriction. */
function parsePanelFilter(filters?: Record<string, unknown>): Set<string> {
  const csv = String(filters?.labPanelIds ?? '')
  return new Set(csv.split(',').map((s) => s.trim()).filter(Boolean))
}

interface NarrativeReport {
  text: string
  date?: string
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
      const p = obsToLabPoint(item)
      if (p) points.push(p)
      continue
    }

    const report = item as DiagnosticReport
    const resolved = (report.result ?? [])
      .map((r: any) => {
        const id = r?.reference?.split('/').pop()
        return id ? allObservations.find((o) => o.id === id) : undefined
      })
      .filter(Boolean) as Observation[]

    let added = 0
    for (const o of resolved) {
      const p = obsToLabPoint(o)
      if (p) {
        points.push(p)
        added++
      }
    }
    if (added === 0 && report.conclusion) {
      conclusions.push({
        text: `${report.code?.text || 'Report'}: ${report.conclusion}`,
        date: report.effectiveDateTime || report.issued,
      })
    }
  }

  return { points, conclusions }
}

const shortDate = (d?: string): string => (d ? d.slice(0, 10) : '')

// ── Pivot rendering (full-trend mode) ───────────────────────────────────────
// Experiment-driven (docs/LAB-FORMAT-EXPERIMENT-2026-07-12.md): a date × test
// markdown pivot beats per-analyte trend lines on answer accuracy (+20pp),
// citation validity (+24pp), hallucinations (¼) AND tokens (0.53–0.83×) —
// the gap widening exactly on data-dense (ICU/onco) patients. Trend lines only
// won single-analyte trajectory reading, so an abnormal-analyte trend appendix
// (key trends) follows the tables. Reuses the cumulative report's pivot
// builder, so abnormal flags come from the shared source-faithful policy
// (isObservationAbnormal), not just interpretation codes.

/** Max analytes in the key-trends appendix. */
const MAX_KEY_TRENDS = 8

function pivotCellText(row: LabRow, date: string): string {
  const cell = row.values.get(date)
  if (!cell) return '-'
  if (!cell.isAbnormal) return cell.value
  return `${cell.value} ${cell.interpretationCode || '*'}`
}

function renderPivotTable(pivot: LabPivot): string[] {
  // Only rows with actual values (skips pinned-column stubs) and only dates
  // those rows cover. Returned as ONE multi-line item so the generic section
  // formatter's "- " bullet lands on the panel tag only — the table lines stay
  // un-prefixed, valid markdown, and cheaper.
  const rows = pivot.rows.filter((r) => r.values.size > 0)
  if (!rows.length) return []
  const dates = pivot.dates.filter((d) => rows.some((r) => r.values.has(d)))
  const header = `| Date | ${rows.map((r) => (r.unit ? `${r.displayName} (${r.unit})` : r.displayName)).join(' | ')} |`
  const sep = `| ${Array(rows.length + 1).fill('---').join(' | ')} |`
  const body = dates.map((d) => `| ${d} | ${rows.map((r) => pivotCellText(r, d)).join(' | ')} |`)
  return [[`[${pivot.category.id}]`, header, sep, ...body].join('\n')]
}

/** Trend lines for analytes with ≥1 abnormal value — covers the one task the
 *  pivot lost in the experiment (following a single analyte over time). */
function renderKeyTrends(pivots: Record<string, LabPivot>, maxTrendPoints: number): string[] {
  const candidates: { row: LabRow; abnormalCount: number }[] = []
  for (const pivot of Object.values(pivots)) {
    for (const row of pivot.rows) {
      if (row.values.size < 2) continue
      const abnormalCount = [...row.values.values()].filter((c) => c.isAbnormal).length
      if (abnormalCount > 0) candidates.push({ row, abnormalCount })
    }
  }
  if (!candidates.length) return []
  candidates.sort((a, b) => b.abnormalCount - a.abnormalCount || b.row.values.size - a.row.values.size)
  const lines = candidates.slice(0, MAX_KEY_TRENDS).map(({ row }) => {
    const series = [...row.values.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const recent = series.slice(-maxTrendPoints)
    const omitted = series.length - recent.length
    const trend = recent
      .map(([date, cell]) => `${cell.value}${cell.isAbnormal ? `[${cell.interpretationCode || '*'}]` : ''} (${date})`)
      .join(' → ')
    const head = row.unit ? `${row.displayName} (${row.unit})` : row.displayName
    return `${head}: ${omitted > 0 ? `…(${omitted} earlier) → ` : ''}${trend}`
  })
  return ['Key trends (analytes with abnormal values, oldest → newest):', ...lines, '']
}

interface WindowedLabs {
  points: LabPoint[]
  conclusions: NarrativeReport[]
  /** Set when the window was empty and we fell back to recent sampling days. */
  fallbackDays: number
}

// Apply the time window with a count-floor fallback: labs are the most
// unevenly distributed category (a stable patient's last panel may predate any
// wall-clock window), so an empty window falls back to the most recent
// FALLBACK_SAMPLING_DAYS distinct sampling days instead of an empty section.
// getCount and getContextSection share this so the badge matches the context.
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
  if (inRangePoints.length > 0 || inRangeConclusions.length > 0) {
    return { points: inRangePoints, conclusions: inRangeConclusions, fallbackDays: 0 }
  }

  const days = [
    ...new Set(
      [...points.map((p) => p.date), ...conclusions.map((c) => c.date)]
        .filter(Boolean)
        .map((d) => (d as string).slice(0, 10)),
    ),
  ]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, FALLBACK_SAMPLING_DAYS)
  if (days.length === 0) return { points: [], conclusions: [], fallbackDays: 0 }

  const daySet = new Set(days)
  const onDays = (d?: string): boolean => !!d && daySet.has(d.slice(0, 10))
  return {
    points: points.filter((p) => onDays(p.date)),
    conclusions: conclusions.filter((c) => onDays(c.date)),
    fallbackDays: days.length,
  }
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
    const standaloneResultObs = selectStandaloneResultObservations(clinicalData)
    return [...labReports, ...standaloneResultObs] as unknown as LabData[]
  },

  // 最新 → distinct analytes (one latest value each); 其他 depth → every reading
  // in the window (the per-test cap only trims the rendered trend, not the
  // badge). So the badge tracks the depth filter (matches Other Observations).
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

    const items: string[] = []

    if (depth === 'latest') {
      // Latest value per analyte — compact list, unchanged.
      const byName = new Map<string, LabPoint[]>()
      for (const p of inRange) {
        const arr = byName.get(p.name)
        if (arr) arr.push(p)
        else byName.set(p.name, [p])
      }
      for (const name of [...byName.keys()].sort()) {
        const series = byName.get(name)!.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        const unit = series[series.length - 1].unit
        const head = `${name}${unit ? ` (${unit})` : ''}`
        const last = series[series.length - 1]
        const flag = last.interp ? ` [${last.interp}]` : ''
        const date = last.date ? ` (${shortDate(last.date)})` : ''
        items.push(`${head}: ${last.value}${flag}${date}`)
      }
    } else {
      // Full-history mode: date × test pivot tables (per lab panel) + key-trend
      // appendix. See the pivot-rendering block above for the experiment basis.
      const pivotable = inRange.filter((p) => p.panel && p.date)
      const pivots = buildLabPivots(pivotable.map((p) => p.obs))
      for (const pivot of Object.values(pivots)) {
        items.push(...renderPivotTable(pivot))
      }
      items.push(...renderKeyTrends(pivots, maxTrendPoints))

      // Uncategorized points (no panel match — free-text analytes etc.) keep
      // the per-analyte trend-line format so no data is lost vs the old view.
      const others = inRange.filter((p) => !p.panel || !p.date)
      if (others.length > 0) {
        const byName = new Map<string, LabPoint[]>()
        for (const p of others) {
          const arr = byName.get(p.name)
          if (arr) arr.push(p)
          else byName.set(p.name, [p])
        }
        items.push('Other results:')
        for (const name of [...byName.keys()].sort()) {
          const series = byName.get(name)!.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
          const unit = series[series.length - 1].unit
          const head = `${name}${unit ? ` (${unit})` : ''}`
          const recent = series.slice(-maxTrendPoints)
          const omitted = series.length - recent.length
          const trend = recent
            .map((p) => `${p.value}${p.interp ? `[${p.interp}]` : ''}${p.date ? ` (${shortDate(p.date)})` : ''}`)
            .join(' → ')
          items.push(`${head}: ${omitted > 0 ? `…(${omitted} earlier) → ` : ''}${trend}`)
        }
        items.push('')
      }
      // Trim trailing blank line for a tidy section.
      while (items.length && items[items.length - 1] === '') items.pop()
    }

    // Narrative reports without numeric results (microbiology / pathology).
    const inRangeConclusions = windowed.conclusions
    if (inRangeConclusions.length > 0) {
      if (items.length > 0) items.push('')
      inRangeConclusions
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach((c) => items.push(`${c.text}${c.date ? ` (${shortDate(c.date)})` : ''}`))
    }

    if (items.length === 0) return null

    if (windowed.fallbackDays > 0) {
      items.unshift(
        `Note: no labs fell within the selected time range; showing the most recent ${windowed.fallbackDays} sampling day(s) instead.`,
        '',
      )
    }

    const title = depth === 'latest'
      ? 'Lab Reports (latest value per test)'
      : 'Lab Reports (date × test pivot per panel, newest first; abnormal flagged H/L/*)'
    return { title, items }
  },
}
