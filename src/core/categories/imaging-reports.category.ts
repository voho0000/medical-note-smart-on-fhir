// Imaging Reports Category — IMPRESSION-FIRST in the AI clinical context.
//
// A radiology/pathology narrative is mostly descriptive sections (INDICATION,
// TECHNIQUE, COMPARISON, FINDINGS, GROSS/MICROSCOPIC DESCRIPTION) that restate
// what the conclusion already says; on a data-dense chart they are the largest
// non-document cost in the context. So:
//
//   • the CURRENT report of each kind — newest per (modality, body region),
//     derived from the study identity, modality alone when no region can be
//     derived — keeps its impression/conclusion section;
//   • every older report in the window keeps one line: date, modality+region,
//     the report title, and the first sentence of its impression.
//
// Nothing is silently guessed: when no conclusion header is recognised the
// report's full narrative is emitted exactly as before (see
// src/core/utils/imaging-impression.utils.ts).
//
// Citation: source keys live only in the prompt's SOURCE LIST, and a line is
// matched back to its DiagnosticReport/ImagingStudy by resource type + date +
// display — so every line here, one-liners included, carries the report's own
// title and its exam date.
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { DiagnosticReport, ImagingStudy, Observation } from '@/src/shared/types/fhir.types'
import { inferGroupFromDiagnosticReport } from '@/src/shared/utils/report-grouping-helpers'
import { makeTimeRangeTest } from '../utils/date-filter.utils'
import { getLatestByName, getCodeableConceptText } from '../utils/data-grouping.utils'
import { referenceId } from '../utils/observation-selectors'
import {
  formatImagingStudyMetadata,
  imagingStudyTitle,
} from '@/src/shared/utils/imaging-study.utils'
import { expandObservationValues, observationDisplayValue } from '@/src/core/utils/observation-value.utils'
import { decodeBase64, stripHtmlToText } from '@/src/core/utils/clinical-documents.utils'
import { normalizeClinicalStatus } from '@/src/core/utils/clinical-context-selection.utils'
import {
  imagingGroupKey,
  imagingImpressionSummary,
  impressionOrFullText,
} from '@/src/core/utils/imaging-impression.utils'

function presentedFormText(report: ImagingReportData): string[] {
  return (report.presentedForm ?? []).map((attachment: any, index) => {
    const contentType = String(attachment?.contentType || '').toLowerCase()
    const label = attachment?.title || `Presented form ${index + 1}`
    if (attachment?.data && (contentType.includes('text') || contentType.includes('html') || contentType.includes('xml') || !contentType)) {
      const decoded = decodeBase64(attachment.data)
      return decoded.trim()
        ? `${label}: ${stripHtmlToText(decoded)}`
        : `${label}: [base64 report attachment could not be decoded]`
    }
    if (attachment?.data) return `${label}: [binary report attachment not decoded; contentType=${contentType || 'unknown'}]`
    if (attachment?.url) return `${label}: [URL-backed report attachment not resolved; contentType=${contentType || 'unknown'}]`
    return `${label}: [attachment body unavailable]`
  })
}

type ImagingReportData = DiagnosticReport & {
  _imagingStudyText?: string
  _imagingStudyIds?: string[]
}

// Helper to get latest imaging reports by name
const getLatestImagingReports = (reports: ImagingReportData[]): ImagingReportData[] => {
  return getLatestByName(
    reports,
    (report) => getCodeableConceptText(report.code),
    // Prefer effectiveDateTime (exam date — 檢查日) over issued, consistent with
    // the time-range filter below and the reports display. getMostRecentDate
    // would pick the LATER of the two (issued), keying "latest" dedup off a
    // different date than the range filter.
    (report) => report.effectiveDateTime || report.issued
  )
}

export const imagingReportsCategory: DataCategory<ImagingReportData> = {
  id: 'imagingReports',
  label: 'Imaging Reports',
  labelKey: 'dataSelection.imagingReports',
  description: 'Radiology, imaging study, and pathology reports',
  descriptionKey: 'dataSelection.imagingReportsDesc',
  group: 'reports',
  order: 50,
  
  filters: [
    {
      key: 'imagingReportVersion',
      type: 'select',
      label: 'Report Version',
      options: [
        { value: 'latest', label: 'Latest Only' },
        { value: 'all', label: 'All Reports' }
      ],
      defaultValue: 'latest'
    },
    {
      key: 'imagingReportTimeRange',
      type: 'select',
      label: 'Time Range',
      options: [
        { value: '1w', label: 'Last Week' },
        { value: '1m', label: 'Last Month' },
        { value: '3m', label: 'Last 3 Months' },
        { value: '6m', label: 'Last 6 Months' },
        { value: '1y', label: 'Last Year' },
        { value: 'sinceLastVisit', label: 'Since last visit' },
        { value: 'all', label: 'All Time' }
      ],
      defaultValue: '1y'
    }
  ],
  
  filterComponentKey: 'imagingReport',
  
  extractData: (clinicalData) => {
    const reports = (clinicalData?.diagnosticReports || []) as DiagnosticReport[]
    const studies = (clinicalData?.imagingStudies || []) as ImagingStudy[]
    const studyById = new Map(studies.filter((study) => !!study.id).map((study) => [study.id!, study]))
    const linkedIds = new Set<string>()

    const reportItems = reports
      .filter((report) => inferGroupFromDiagnosticReport(report) === 'imaging')
      .map((report): ImagingReportData => {
        const ids = (report.imagingStudy ?? [])
          .map((ref) => referenceId(ref.reference))
          .filter((id): id is string => !!id)
        ids.forEach((id) => linkedIds.add(id))
        const metadata = ids
          .map((id) => studyById.get(id))
          .filter((study): study is ImagingStudy => !!study)
          .map((study) => formatImagingStudyMetadata(study))
        return {
          ...report,
          _imagingStudyIds: ids,
          _imagingStudyText: metadata.join('\n\n'),
        }
      })

    const standaloneItems = studies
      .filter((study) => !study.id || !linkedIds.has(study.id))
      .map((study): ImagingReportData => ({
        id: study.id,
        resourceType: 'ImagingStudy',
        status: study.status,
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
            code: 'RAD',
            display: 'Radiology',
          }],
          text: 'Imaging',
        }],
        code: { text: imagingStudyTitle(study) },
        encounter: study.encounter,
        effectiveDateTime: study.started,
        _imagingStudyIds: study.id ? [study.id] : [],
        _imagingStudyText: formatImagingStudyMetadata(study),
      }))

    return [...reportItems, ...standaloneItems]
  },
  
  getCount: (data, filters, allClinicalData) => {
    // Filter out reports without content (matching useReportsData logic)
    let filtered = data.filter(report => {
      if (normalizeClinicalStatus(report.status) === 'entered-in-error') return false
      const hasObservations = report.result && report.result.length > 0
      const hasConclusion = !!report.conclusion
      const hasNotes = Array.isArray((report as any).note) && (report as any).note.length > 0
      const hasAttachment = Array.isArray(report.presentedForm) && report.presentedForm.length > 0
      const hasStudyMetadata = !!report._imagingStudyText || (report._imagingStudyIds?.length ?? 0) > 0
      
      return hasObservations || hasConclusion || hasNotes || hasAttachment || hasStudyMetadata
    })
    
    const timeRange = filters.imagingReportTimeRange as string
    if (timeRange && timeRange !== 'all') {
      const inWindow = makeTimeRangeTest(timeRange, allClinicalData)
      filtered = filtered.filter(report =>
        inWindow(report.effectiveDateTime || report.issued)
      )
    }

    if (filters.imagingReportVersion === 'latest') {
      filtered = getLatestImagingReports(filtered)
    }

    return filtered.length
  },
  
  getContextSection: (data, filters, allClinicalData): ClinicalContextSection | null => {
    if (data.length === 0) return null
    
    let filtered = data.filter((report) => normalizeClinicalStatus(report.status) !== 'entered-in-error')

    const timeRange = filters.imagingReportTimeRange as string
    if (timeRange && timeRange !== 'all') {
      const inWindow = makeTimeRangeTest(timeRange, allClinicalData)
      filtered = filtered.filter(report =>
        inWindow(report.effectiveDateTime || report.issued)
      )
    }

    if (filtered.length === 0) {
      return { title: 'Imaging Reports', items: ['No imaging reports found within the selected time range.'] }
    }

    if (filters.imagingReportVersion === 'latest') {
      filtered = getLatestImagingReports(filtered)
    }

    const observations = allClinicalData?.observations || []

    const resolveObservations = (report: ImagingReportData): Observation[] => {
      const reportObs: Observation[] = []
      report.result?.forEach(result => {
        const id = referenceId(result.reference)
        if (id) {
          const obs = observations.find((o: Observation) => o.id === id)
          if (obs) reportObs.push(obs)
        }
      })
      return reportObs
    }

    const observationTexts = (reportObs: Observation[]): string[] =>
      reportObs.flatMap((obs) =>
        expandObservationValues(obs).flatMap((valueObservation) => {
          const display = observationDisplayValue(valueObservation)
          if (!display) return []
          const label = valueObservation.code?.text
            || valueObservation.code?.coding?.[0]?.display
            || 'Finding'
          return [`${label}: ${display.value}${display.unit ? ` ${display.unit}` : ''}`]
        }),
      )

    // Narrative sources, in the order a reader would want them. `_imagingStudyText`
    // is DICOM provenance rather than report prose, so it is never fed to the
    // impression extractor — it is appended verbatim to the current report and
    // is the whole narrative when a standalone ImagingStudy has no report.
    const reportNarrative = (report: ImagingReportData): string =>
      [
        report.conclusion,
        ...(report.note ?? []).map((note) => note.text),
        ...presentedFormText(report),
      ].filter((text): text is string => !!text?.trim()).join('\n')

    const examDate = (report: ImagingReportData): string =>
      (report.effectiveDateTime || report.issued || '').slice(0, 10)

    const reportTitle = (report: ImagingReportData): string =>
      report.code?.text || 'Imaging Study'

    // Group by what the study IS, so the newest chest CT wins over an older
    // chest CT even when the two were coded with different titles/languages.
    const groups = new Map<string, ImagingReportData[]>()
    for (const report of filtered) {
      const identity = [
        reportTitle(report),
        ...(report.code?.coding ?? []).map((coding) => coding.display || coding.code || ''),
        ...[report.category ?? []].flat().map((category) => category?.text || ''),
        report._imagingStudyText?.match(/^Modality: .*$/m)?.[0] ?? '',
      ].join(' ')
      const { key } = imagingGroupKey(identity)
      const bucket = groups.get(key)
      if (bucket) bucket.push(report)
      else groups.set(key, [report])
    }

    const current = new Set<ImagingReportData>()
    for (const bucket of groups.values()) {
      const newest = [...bucket].sort((a, b) => examDate(b).localeCompare(examDate(a)))[0]
      if (newest) current.add(newest)
    }

    const labelFor = (report: ImagingReportData): string => {
      const identity = [
        reportTitle(report),
        ...(report.code?.coding ?? []).map((coding) => coding.display || coding.code || ''),
      ].join(' ')
      return imagingGroupKey(identity).label
    }

    const items: string[] = []
    const olderLines: string[] = []
    const sorted = [...filtered].sort((a, b) => examDate(b).localeCompare(examDate(a)))

    sorted.forEach(report => {
      const reportObs = resolveObservations(report)
      const narrative = reportNarrative(report)
      const date = examDate(report)
      const datePart = date ? ` (${date})` : ''

      if (current.has(report)) {
        // Current study of its kind: impression section only, plus any
        // structured measurements and DICOM metadata.
        const impression = impressionOrFullText(narrative) || report._imagingStudyText?.trim() || ''
        const values = observationTexts(reportObs)
        if (!impression && values.length === 0) return
        items.push(`${reportTitle(report)}${datePart}${impression ? `: ${impression}` : ''}`)
        values.forEach((text) => items.push(`  • ${text}`))
        if (impression && report._imagingStudyText?.trim()) {
          items.push(`  • ${report._imagingStudyText.trim()}`)
        }
        return
      }

      // Older study of the same kind: one line, still citable (title + date).
      const gist = imagingImpressionSummary(narrative || report._imagingStudyText)
      const values = observationTexts(reportObs)
      const tail = [gist, values.join('; ')].filter(Boolean).join(' — ')
      if (!tail) return
      const label = labelFor(report)
      olderLines.push(`${date || 'undated'} | ${label ? `${label} | ` : ''}${reportTitle(report)}: ${tail}`)
    })

    if (olderLines.length > 0) {
      if (items.length > 0) items.push('')
      items.push('Earlier studies (one-line impressions):', ...olderLines)
    }

    if (items.length === 0) return null

    const title = filters.imagingReportVersion === 'latest'
      ? 'Imaging Reports (Latest Only; impression/conclusion section for the current study of each modality+region, one line for earlier studies)'
      : 'Imaging Reports (impression/conclusion section for the current study of each modality+region, one line for earlier studies)'

    return { title, items }
  }
}
