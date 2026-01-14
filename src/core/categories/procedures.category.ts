// Procedures Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { Procedure } from '@/src/shared/types/fhir.types'
import { isWithinTimeRange, getMostRecentDate } from '../utils/date-filter.utils'
import { getLatestByName, getCodeableConceptText } from '../utils/data-grouping.utils'
import { ProcedureFilter } from '@/features/data-selection/components/DataFilters'

const getPerformedDate = (procedure: Procedure): string | undefined => {
  return getMostRecentDate(
    procedure.performedDateTime,
    procedure.performedPeriod?.end,
    procedure.performedPeriod?.start
  )
}

const getLatestProcedures = (procedures: Procedure[]): Procedure[] => {
  return getLatestByName(
    procedures,
    (proc) => getCodeableConceptText(proc.code, 'Procedure'),
    getPerformedDate
  )
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
      filtered = getLatestProcedures(filtered)
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
      filtered = getLatestProcedures(filtered)
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
