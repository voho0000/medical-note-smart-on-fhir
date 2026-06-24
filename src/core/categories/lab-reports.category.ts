// Lab Reports Category — presented as a per-analyte TIME SERIES so the AI can
// see trends (e.g. Creatinine 1.2 → 1.5 → 2.0 = worsening renal function).
// Lab values are intentionally NOT scattered under each visit in the encounter
// view; the trend lives here, in one place, undivided.
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { DiagnosticReport, Observation } from '@/src/shared/types/fhir.types'
import { inferGroupFromCategory } from '@/src/shared/utils/report-grouping-helpers'
import { selectStandaloneResultObservations } from '@/src/core/utils/observation-selectors'
import { formatNumberSmart } from '@/src/shared/utils/number-format.utils'
import { isWithinTimeRange } from '../utils/date-filter.utils'

// Union type for lab data (DiagnosticReport or standalone Observation)
type LabData = DiagnosticReport | Observation

// Cap the trend at the most recent N readings per analyte to keep the context
// bounded; older points are summarised as "…(N earlier)".
const MAX_TREND_POINTS = 8

function isObservation(item: LabData): item is Observation {
  return (item as any).resourceType === 'Observation' || !!(item as Observation).valueQuantity || !!(item as Observation).valueString
}

interface LabPoint {
  name: string
  unit: string
  value: string
  date?: string
  interp?: string
}

function obsToLabPoint(o: any): LabPoint | null {
  const name = o?.code?.text || o?.code?.coding?.[0]?.display || 'Lab'
  const raw = o?.valueQuantity?.value ?? o?.valueString
  if (raw === undefined || raw === null || raw === '') return null
  const value = typeof raw === 'number' ? formatNumberSmart(raw) : String(raw)
  const unit = o?.valueQuantity?.unit || ''
  const date = o?.effectiveDateTime
  const interp = o?.interpretation?.coding?.[0]?.code || o?.interpretation?.text || undefined
  return { name, unit, value, date, interp }
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
      key: 'labReportVersion',
      type: 'select',
      label: 'Report Version',
      options: [
        { value: 'latest', label: 'Latest value' },
        { value: 'all', label: 'Full trend' },
      ],
      defaultValue: 'all',
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

  // 最新 → distinct analytes (one latest value each); 全部 → every reading. So
  // the badge tracks the version filter (matches Other Observations).
  getCount: (data, filters, allClinicalData) => {
    const { points } = collectLabPoints(data, allClinicalData?.observations || [])
    const range = (filters?.labReportTimeRange as string) || 'all'
    const inRange = range === 'all' ? points : points.filter((p) => isWithinTimeRange(p.date, range))
    const version = (filters?.labReportVersion as string) || 'latest'
    if (version === 'all') return inRange.length
    return new Set(inRange.map((p) => p.name)).size
  },

  getContextSection: (data, filters, allClinicalData): ClinicalContextSection | null => {
    if (data.length === 0) return null

    const range = (filters?.labReportTimeRange as string) || 'all'
    const version = (filters?.labReportVersion as string) || 'latest'
    const { points, conclusions } = collectLabPoints(data, allClinicalData?.observations || [])

    const inRange = range === 'all' ? points : points.filter((p) => isWithinTimeRange(p.date, range))

    // Group readings by analyte.
    const byName = new Map<string, LabPoint[]>()
    for (const p of inRange) {
      const arr = byName.get(p.name)
      if (arr) arr.push(p)
      else byName.set(p.name, [p])
    }

    const items: string[] = []
    for (const name of [...byName.keys()].sort()) {
      const series = byName.get(name)!.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      const unit = series[series.length - 1].unit
      const head = `${name}${unit ? ` (${unit})` : ''}`

      if (version === 'latest') {
        const last = series[series.length - 1]
        const flag = last.interp ? ` [${last.interp}]` : ''
        const date = last.date ? ` (${shortDate(last.date)})` : ''
        items.push(`${head}: ${last.value}${flag}${date}`)
      } else {
        const recent = series.slice(-MAX_TREND_POINTS)
        const omitted = series.length - recent.length
        const trend = recent
          .map((p) => `${p.value}${p.interp ? `[${p.interp}]` : ''}${p.date ? ` (${shortDate(p.date)})` : ''}`)
          .join(' → ')
        items.push(`${head}: ${omitted > 0 ? `…(${omitted} earlier) → ` : ''}${trend}`)
      }
    }

    // Narrative reports without numeric results (microbiology / pathology).
    const inRangeConclusions = range === 'all'
      ? conclusions
      : conclusions.filter((c) => isWithinTimeRange(c.date, range))
    if (inRangeConclusions.length > 0) {
      if (items.length > 0) items.push('')
      inRangeConclusions
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .forEach((c) => items.push(`${c.text}${c.date ? ` (${shortDate(c.date)})` : ''}`))
    }

    if (items.length === 0) return null

    const title = version === 'latest'
      ? 'Lab Reports (latest value per test)'
      : 'Lab Reports (trend, oldest → newest)'
    return { title, items }
  },
}
