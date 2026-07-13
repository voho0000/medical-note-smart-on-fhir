// Imaging Reports Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { DiagnosticReport, ImagingStudy, Observation } from '@/src/shared/types/fhir.types'
import { inferGroupFromCategory } from '@/src/shared/utils/report-grouping-helpers'
import { makeTimeRangeTest } from '../utils/date-filter.utils'
import { getLatestByName, getCodeableConceptText } from '../utils/data-grouping.utils'
import { referenceId } from '../utils/observation-selectors'
import {
  formatImagingStudyMetadata,
  imagingStudyTitle,
} from '@/src/shared/utils/imaging-study.utils'

type ImagingReportData = DiagnosticReport & {
  _imagingStudyText?: string
  _imagingStudyIds?: string[]
}

// In 'all reports' mode a high-frequency-imaging patient (e.g. an oncology or
// ICU case) can have many dozens of studies in a wide window. Cap the rendered
// list at the most recent N so the context stays bounded; older ones collapse
// to a summary line. 'latest' mode already dedups by name, so this only bites
// the full-history view.
const MAX_IMAGING_REPORTS = 25

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
  description: 'Radiology and imaging study reports',
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
      .filter((report) =>
        inferGroupFromCategory(report.category) === 'imaging'
        || (report.imagingStudy?.length ?? 0) > 0
      )
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
    
    let filtered = data

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

    // Bound the full-history list to the most recent N studies.
    let omittedImaging = 0
    if (filtered.length > MAX_IMAGING_REPORTS) {
      const byDateDesc = [...filtered].sort((a, b) =>
        (b.effectiveDateTime || b.issued || '').localeCompare(a.effectiveDateTime || a.issued || '')
      )
      omittedImaging = filtered.length - MAX_IMAGING_REPORTS
      filtered = byDateDesc.slice(0, MAX_IMAGING_REPORTS)
    }

    const observations = allClinicalData?.observations || []
    
    const items: string[] = []
    filtered.forEach(report => {
      const reportObs: Observation[] = []
      report.result?.forEach(result => {
        const id = referenceId(result.reference)
        if (id) {
          const obs = observations.find((o: Observation) => o.id === id)
          if (obs) reportObs.push(obs)
        }
      })
      
      const datePart = report.effectiveDateTime 
        ? ` (${new Date(report.effectiveDateTime).toLocaleDateString()})` 
        : ''
      
      if (reportObs.length > 0) {
        items.push(`${report.code?.text || 'Imaging Study'}${datePart}`)
        reportObs.forEach(obs => {
          const value = obs.valueQuantity?.value ?? obs.valueString
          const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : ''
          if (value !== undefined && value !== null) {
            items.push(`  • ${obs.code?.text || 'Finding'}: ${value}${unit}`)
          }
        })
        const reportText = [
          report.conclusion,
          ...(report.note ?? []).map((note) => note.text),
          report._imagingStudyText,
        ].filter((text): text is string => !!text?.trim())
        reportText.forEach((text) => items.push(`  • ${text}`))
      } else {
        const narrative = [
          report.conclusion,
          ...(report.note ?? []).map((note) => note.text),
          report._imagingStudyText,
        ].filter((text): text is string => !!text?.trim()).join('\n')
        if (narrative) {
          items.push(`${report.code?.text || 'Study'}${datePart}: ${narrative}`)
        }
      }
    })
    
    if (items.length === 0) return null

    if (omittedImaging > 0) {
      items.push(`…and ${omittedImaging} earlier imaging report(s) omitted for brevity.`)
    }

    const title = filters.imagingReportVersion === 'latest'
      ? 'Imaging Reports (Latest Only)'
      : 'Imaging Reports'

    return { title, items }
  }
}
