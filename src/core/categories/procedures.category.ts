// Procedures Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import { ProcedureFilter } from '@/features/data-selection/components/DataFilters'

interface Procedure {
  code?: { 
    text?: string
    coding?: Array<{ display?: string }>
  }
  performedDateTime?: string
  performedPeriod?: { start?: string; end?: string }
  status?: string
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

const getPerformedDate = (procedure: Procedure): string | undefined => {
  return procedure.performedDateTime || 
         procedure.performedPeriod?.end || 
         procedure.performedPeriod?.start
}

const getLatestByName = (procedures: Procedure[]): Procedure[] => {
  const byName = new Map<string, Procedure>()
  
  const sorted = [...procedures].sort((a, b) => 
    (getPerformedDate(b) || '').localeCompare(getPerformedDate(a) || '')
  )
  
  sorted.forEach(procedure => {
    const name = procedure.code?.text || procedure.code?.coding?.[0]?.display || 'Procedure'
    if (!byName.has(name)) {
      byName.set(name, procedure)
    }
  })
  
  return Array.from(byName.values())
}

export const proceduresCategory: DataCategory<Procedure> = {
  id: 'procedures',
  label: 'Procedures',
  labelKey: 'dataSelection.procedures',
  description: 'Medical procedures and interventions',
  descriptionKey: 'dataSelection.proceduresDesc',
  group: 'procedures',
  order: 60,
  
  filters: [
    {
      key: 'procedureVersion',
      type: 'select',
      label: 'Procedure Version',
      options: [
        { value: 'latest', label: 'Latest Only' },
        { value: 'all', label: 'All Procedures' }
      ],
      defaultValue: 'latest'
    },
    {
      key: 'procedureTimeRange',
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
  
  FilterComponent: ProcedureFilter,
  
  extractData: (clinicalData) => clinicalData?.procedures || [],
  
  getCount: (data, filters) => {
    let filtered = data
    
    const timeRange = filters.procedureTimeRange as string
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(p => isWithinTimeRange(getPerformedDate(p), timeRange))
    }
    
    if (filters.procedureVersion === 'latest') {
      filtered = getLatestByName(filtered)
    }
    
    return filtered.length
  },
  
  getContextSection: (data, filters): ClinicalContextSection | null => {
    if (data.length === 0) return null
    
    let filtered = data
    
    const timeRange = filters.procedureTimeRange as string
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(p => isWithinTimeRange(getPerformedDate(p), timeRange))
    }
    
    if (filtered.length === 0) {
      return { title: 'Procedures', items: ['No procedures found within the selected time range.'] }
    }
    
    if (filters.procedureVersion === 'latest') {
      filtered = getLatestByName(filtered)
    }
    
    const items = filtered.map(procedure => {
      const name = procedure.code?.text || procedure.code?.coding?.[0]?.display || 'Procedure'
      const performed = getPerformedDate(procedure)
      const datePart = performed ? ` (${new Date(performed).toLocaleDateString()})` : ''
      const status = procedure.status ? ` – ${procedure.status}` : ''
      return `${name}${datePart}${status}`.trim()
    })
    
    if (items.length === 0) return null
    
    return { title: 'Procedures', items }
  }
}
