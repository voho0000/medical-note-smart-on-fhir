// Lab Reports Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import { inferGroupFromCategory } from '@/features/clinical-summary/reports/utils/grouping-helpers'

interface DiagnosticReport {
  id?: string
  code?: { text?: string }
  category?: any
  effectiveDateTime?: string
  issued?: string
  conclusion?: string
  result?: Array<{ reference?: string }>
}

interface Observation {
  id?: string
  code?: { text?: string }
  valueQuantity?: { value?: number; unit?: string }
  valueString?: string
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

const getLatestByName = (reports: DiagnosticReport[]): DiagnosticReport[] => {
  const byName = new Map<string, DiagnosticReport>()
  
  // Sort by date descending first
  const sorted = [...reports].sort((a, b) => 
    (b.effectiveDateTime || b.issued || '').localeCompare(a.effectiveDateTime || a.issued || '')
  )
  
  sorted.forEach(report => {
    const name = report.code?.text || 'Unknown'
    if (!byName.has(name)) {
      byName.set(name, report)
    }
  })
  
  return Array.from(byName.values())
}

export const labReportsCategory: DataCategory<DiagnosticReport> = {
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
  
  extractData: (clinicalData) => {
    const reports = clinicalData?.diagnosticReports || []
    return reports.filter((report: DiagnosticReport) => 
      inferGroupFromCategory(report.category) === 'lab'
    )
  },
  
  getCount: (data, filters, allClinicalData) => {
    // Filter out reports without content (matching useReportsData logic)
    let filtered = data.filter(report => {
      // Check if report has observations
      const hasObservations = report.result && report.result.length > 0
      // Check if report has conclusion or notes
      const hasConclusion = !!report.conclusion
      const hasNotes = Array.isArray((report as any).note) && (report as any).note.length > 0
      
      return hasObservations || hasConclusion || hasNotes
    })
    
    // Apply time range filter
    const timeRange = filters.labReportTimeRange as string
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(report => 
        isWithinTimeRange(report.effectiveDateTime || report.issued, timeRange)
      )
    }
    
    // Apply version filter
    if (filters.labReportVersion === 'latest') {
      filtered = getLatestByName(filtered)
    }
    
    return filtered.length
  },
  
  getContextSection: (data, filters, allClinicalData): ClinicalContextSection | null => {
    if (data.length === 0) return null
    
    let filtered = data
    
    // Apply time range filter
    const timeRange = filters.labReportTimeRange as string
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(report => 
        isWithinTimeRange(report.effectiveDateTime || report.issued, timeRange)
      )
    }
    
    if (filtered.length === 0) {
      return { title: 'Lab Reports', items: ['No lab reports found within the selected time range.'] }
    }
    
    // Apply version filter
    if (filters.labReportVersion === 'latest') {
      filtered = getLatestByName(filtered)
    }
    
    // Get observations for reports
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
        items.push(`${report.code?.text || 'Lab Panel'}${datePart}`)
        reportObs.forEach(obs => {
          const value = obs.valueQuantity?.value ?? obs.valueString
          const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : ''
          if (value !== undefined && value !== null) {
            items.push(`  • ${obs.code?.text || 'Test'}: ${value}${unit}`)
          }
        })
      } else if (report.conclusion) {
        items.push(`${report.code?.text || 'Report'}: ${report.conclusion}${datePart}`)
      }
    })
    
    if (items.length === 0) return null
    
    const title = filters.labReportVersion === 'latest' 
      ? 'Lab Reports (Latest Only)' 
      : 'Lab Reports'
    
    return { title, items }
  }
}
