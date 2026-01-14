// Lab Reports Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import { inferGroupFromCategory, inferGroupFromObservation } from '@/features/clinical-summary/reports/utils/grouping-helpers'
import { formatNumberSmart } from '@/features/clinical-summary/reports/utils/number-format.utils'
import { LabReportFilter } from '@/features/data-selection/components/DataFilters'

interface DiagnosticReport {
  id?: string
  code?: { text?: string }
  category?: any
  effectiveDateTime?: string
  issued?: string
  conclusion?: string
  result?: Array<{ reference?: string }>
  resourceType?: string
}

interface Observation {
  id?: string
  code?: { text?: string }
  category?: any
  effectiveDateTime?: string
  valueQuantity?: { value?: number; unit?: string }
  valueString?: string
  resourceType?: string
}

// Union type for lab data (can be DiagnosticReport or standalone Observation)
type LabData = DiagnosticReport | Observation

function isObservation(item: LabData): item is Observation {
  return (item as any).resourceType === 'Observation' || !!(item as Observation).valueQuantity || !!(item as Observation).valueString
}

const isWithinTimeRange = (dateString: string | undefined, range: string): boolean => {
  if (!dateString || range === 'all') return true
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false
  
  const now = new Date()
  const diffInMs = now.getTime() - date.getTime()
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24)
  
  switch (range) {
    case '1w': return diffInDays <= 7
    case '1m': return diffInDays <= 30
    case '3m': return diffInDays <= 90
    case '6m': return diffInDays <= 180
    case '1y': return diffInDays <= 365
    default: return true
  }
}

const getLatestByName = (items: LabData[]): LabData[] => {
  const byName = new Map<string, LabData>()
  
  // Sort by date descending first
  const sorted = [...items].sort((a, b) => {
    const dateA = (a as DiagnosticReport).effectiveDateTime || (a as DiagnosticReport).issued || (a as Observation).effectiveDateTime || ''
    const dateB = (b as DiagnosticReport).effectiveDateTime || (b as DiagnosticReport).issued || (b as Observation).effectiveDateTime || ''
    return dateB.localeCompare(dateA)
  })
  
  sorted.forEach(item => {
    const name = item.code?.text || 'Unknown'
    if (!byName.has(name)) {
      byName.set(name, item)
    }
  })
  
  return Array.from(byName.values())
}

export const labReportsCategory: DataCategory<LabData> = {
  id: 'labReports',
  label: 'Lab Reports',
  labelKey: 'dataSelection.labReports',
  description: 'Laboratory test results and panels',
  descriptionKey: 'dataSelection.labReportsDesc',
  group: 'diagnostics',
  order: 40,
  
  filters: [
    {
      key: 'labReportVersion',
      type: 'select',
      label: 'Report Version',
      options: [
        { value: 'latest', label: 'Latest Only' },
        { value: 'all', label: 'All Reports' }
      ],
      defaultValue: 'latest'
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
        { value: 'all', label: 'All Time' }
      ],
      defaultValue: 'all'
    }
  ],
  
  FilterComponent: LabReportFilter,
  
  extractData: (clinicalData) => {
    const results: LabData[] = []
    
    // Include DiagnosticReports that are lab reports
    const reports = clinicalData?.diagnosticReports || []
    const labReports = reports.filter((report: DiagnosticReport) => 
      inferGroupFromCategory(report.category) === 'lab'
    )
    results.push(...labReports)
    
    // Include standalone lab observations (not in any DiagnosticReport)
    const observations = clinicalData?.observations || []
    const allReportObsIds = new Set<string>()
    
    // Collect all observation IDs that are already in reports
    reports.forEach((report: DiagnosticReport) => {
      report.result?.forEach((result: any) => {
        const id = result.reference?.split('/').pop()
        if (id) allReportObsIds.add(id)
      })
    })
    
    // Filter standalone lab observations
    const standaloneLabObs = observations.filter((obs: Observation) => {
      // Skip if already in a report
      if (obs.id && allReportObsIds.has(obs.id)) return false
      // Check if it's a lab observation
      return inferGroupFromObservation(obs) === 'lab'
    })
    
    results.push(...standaloneLabObs)
    
    return results
  },
  
  getCount: (data, filters, allClinicalData) => {
    // Filter out items without content
    let filtered = data.filter(item => {
      // For standalone observations, they always have content (valueQuantity or valueString)
      if (isObservation(item)) {
        return !!(item.valueQuantity || item.valueString)
      }
      
      // For DiagnosticReports, check if they have observations, conclusion, or notes
      const report = item as DiagnosticReport
      const hasObservations = report.result && report.result.length > 0
      const hasConclusion = !!report.conclusion
      const hasNotes = Array.isArray((report as any).note) && (report as any).note.length > 0
      
      return hasObservations || hasConclusion || hasNotes
    })
    
    // Apply time range filter - with safe access and default value
    const timeRange = (filters?.labReportTimeRange as string) || 'all'
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(item => {
        const date = isObservation(item) 
          ? item.effectiveDateTime 
          : ((item as DiagnosticReport).effectiveDateTime || (item as DiagnosticReport).issued)
        return isWithinTimeRange(date, timeRange)
      })
    }
    
    // Apply version filter - with safe access and default value
    const version = (filters?.labReportVersion as string) || 'latest'
    if (version === 'latest') {
      filtered = getLatestByName(filtered)
    }
    
    return filtered.length
  },
  
  getContextSection: (data, filters, allClinicalData): ClinicalContextSection | null => {
    if (data.length === 0) return null
    
    let filtered = data
    
    // Apply time range filter - with safe access and default value
    const timeRange = (filters?.labReportTimeRange as string) || 'all'
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(item => {
        const date = isObservation(item) 
          ? item.effectiveDateTime 
          : ((item as DiagnosticReport).effectiveDateTime || (item as DiagnosticReport).issued)
        return isWithinTimeRange(date, timeRange)
      })
    }
    
    if (filtered.length === 0) {
      return { title: 'Lab Reports', items: ['No lab reports found within the selected time range.'] }
    }
    
    // Apply version filter - with safe access and default value
    const version = (filters?.labReportVersion as string) || 'latest'
    if (version === 'latest') {
      filtered = getLatestByName(filtered)
    }
    
    // Get observations for reports
    const observations = allClinicalData?.observations || []
    
    const items: string[] = []
    filtered.forEach(item => {
      // Handle standalone observations
      if (isObservation(item)) {
        const obs = item as Observation
        const value = obs.valueQuantity?.value ?? obs.valueString
        const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : ''
        const datePart = obs.effectiveDateTime 
          ? ` (${new Date(obs.effectiveDateTime).toLocaleDateString()})` 
          : ''
        
        if (value !== undefined && value !== null) {
          const formattedValue = typeof value === 'number' ? formatNumberSmart(value) : value
          items.push(`${obs.code?.text || 'Lab Test'}: ${formattedValue}${unit}${datePart}`)
        }
        return
      }
      
      // Handle DiagnosticReports
      const report = item as DiagnosticReport
      const reportObs: Observation[] = []
      report.result?.forEach((result: any) => {
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
        items.push(`${report.code?.text || 'Lab Panel'}${datePart}`)
        reportObs.forEach(obs => {
          const value = obs.valueQuantity?.value ?? obs.valueString
          const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : ''
          if (value !== undefined && value !== null) {
            const formattedValue = typeof value === 'number' ? formatNumberSmart(value) : value
            items.push(`  • ${obs.code?.text || 'Test'}: ${formattedValue}${unit}`)
          }
        })
      } else if (report.conclusion) {
        items.push(`${report.code?.text || 'Report'}: ${report.conclusion}${datePart}`)
      }
    })
    
    if (items.length === 0) return null
    
    const reportVersion = (filters?.labReportVersion as string) || 'latest'
    const title = reportVersion === 'latest' 
      ? 'Lab Reports (Latest Only)' 
      : 'Lab Reports'
    
    return { title, items }
  }
}
