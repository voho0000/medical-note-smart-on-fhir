// Imaging Reports Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { DiagnosticReport, Observation } from '@/src/shared/types/fhir.types'
import { inferGroupFromCategory } from '@/features/clinical-summary/reports/utils/grouping-helpers'
import { isWithinTimeRange, getMostRecentDate } from '../utils/date-filter.utils'
import { getLatestByName, getCodeableConceptText } from '../utils/data-grouping.utils'
import { ImagingReportFilter } from '@/features/data-selection/components/DataFilters'

// Helper to get latest imaging reports by name
const getLatestImagingReports = (reports: DiagnosticReport[]): DiagnosticReport[] => {
  return getLatestByName(
    reports,
    (report) => getCodeableConceptText(report.code),
    (report) => getMostRecentDate(report.effectiveDateTime, report.issued)
  )
}

export const imagingReportsCategory: DataCategory<DiagnosticReport> = {
  id: 'imagingReports',
  label: 'Imaging Reports',
  labelKey: 'dataSelection.imagingReports',
  description: 'Radiology and imaging study reports',
  descriptionKey: 'dataSelection.imagingReportsDesc',
  group: 'diagnostics',
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
        { value: 'all', label: 'All Time' }
      ],
      defaultValue: 'all'
    }
  ],
  
  FilterComponent: ImagingReportFilter,
  
  extractData: (clinicalData) => {
    const reports = clinicalData?.diagnosticReports || []
    return reports.filter((report: DiagnosticReport) => 
      inferGroupFromCategory(report.category) === 'imaging'
    )
  },
  
  getCount: (data, filters, allClinicalData) => {
    // Filter out reports without content (matching useReportsData logic)
    let filtered = data.filter(report => {
      const hasObservations = report.result && report.result.length > 0
      const hasConclusion = !!report.conclusion
      const hasNotes = Array.isArray((report as any).note) && (report as any).note.length > 0
      
      return hasObservations || hasConclusion || hasNotes
    })
    
    const timeRange = filters.imagingReportTimeRange as string
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(report => 
        isWithinTimeRange(report.effectiveDateTime || report.issued, timeRange)
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
      filtered = filtered.filter(report => 
        isWithinTimeRange(report.effectiveDateTime || report.issued, timeRange)
      )
    }
    
    if (filtered.length === 0) {
      return { title: 'Imaging Reports', items: ['No imaging reports found within the selected time range.'] }
    }
    
    if (filters.imagingReportVersion === 'latest') {
      filtered = getLatestImagingReports(filtered)
    }
    
    const observations = allClinicalData?.observations || []
    
    const items: string[] = []
    filtered.forEach(report => {
      const reportObs: Observation[] = []
      report.result?.forEach(result => {
        const id = result.reference?.split('/').pop()
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
      } else if (report.conclusion) {
        items.push(`${report.code?.text || 'Study'}: ${report.conclusion}${datePart}`)
      }
    })
    
    if (items.length === 0) return null
    
    const title = filters.imagingReportVersion === 'latest' 
      ? 'Imaging Reports (Latest Only)' 
      : 'Imaging Reports'
    
    return { title, items }
  }
}
