// Conditions Category
import type { DataCategory, ClinicalContextSection, FilterValue } from '../interfaces/data-category.interface'
import type { Condition } from '@/src/shared/types/fhir.types'
import { ConditionFilter } from '@/features/data-selection/components/DataFilters'

const isActiveCondition = (condition: Condition): boolean => {
  const clinicalStatus = condition.clinicalStatus
  if (!clinicalStatus) return true
  
  let statusStr: string
  if (typeof clinicalStatus === 'string') {
    statusStr = clinicalStatus.toLowerCase()
  } else {
    statusStr = (clinicalStatus.coding?.[0]?.code || clinicalStatus.text || '').toLowerCase()
  }
  
  return statusStr === 'active' || statusStr === 'recurrence' || statusStr === 'relapse'
}

export const conditionsCategory: DataCategory<Condition> = {
  id: 'conditions',
  label: 'Diagnoses',
  labelKey: 'dataSelection.conditions',
  description: 'Current and historical diagnoses',
  descriptionKey: 'dataSelection.conditionsDesc',
  group: 'clinical',
  order: 10,
  
  filters: [
    {
      key: 'conditionStatus',
      type: 'select',
      label: 'Diagnosis Status',
      options: [
        { value: 'active', label: 'Active Only' },
        { value: 'all', label: 'All Diagnoses' }
      ],
      defaultValue: 'active'
    }
  ],
  
  FilterComponent: ConditionFilter,
  
  extractData: (clinicalData) => clinicalData?.conditions || [],
  
  getCount: (data, filters) => {
    if (filters.conditionStatus === 'active') {
      return data.filter(isActiveCondition).length
    }
    return data.length
  },
  
  getContextSection: (data, filters): ClinicalContextSection | null => {
    if (data.length === 0) return null
    
    let conditions = data
    if (filters.conditionStatus === 'active') {
      conditions = data.filter(isActiveCondition)
    }
    
    if (conditions.length === 0) return null
    
    const activeConditions = conditions.filter(isActiveCondition)
    const resolvedConditions = conditions.filter(c => !isActiveCondition(c))
    
    const items: string[] = []
    
    if (activeConditions.length > 0) {
      items.push('Active Conditions:')
      activeConditions.forEach(condition => {
        const name = condition.code?.text || 'Unknown diagnosis'
        const date = condition.recordedDate 
          ? ` (recorded: ${new Date(condition.recordedDate).toLocaleDateString()})` 
          : ''
        items.push(`  • ${name}${date}`)
      })
    }
    
    if (resolvedConditions.length > 0) {
      if (items.length > 0) items.push('')
      items.push('Resolved Conditions:')
      resolvedConditions.forEach(condition => {
        const name = condition.code?.text || 'Unknown diagnosis'
        const date = condition.recordedDate 
          ? ` (${new Date(condition.recordedDate).toLocaleDateString()})` 
          : ''
        const status = typeof condition.clinicalStatus === 'string'
          ? condition.clinicalStatus
          : condition.clinicalStatus?.coding?.[0]?.code || condition.clinicalStatus?.text
        const statusLabel = status ? ` [${status}]` : ''
        items.push(`  • ${name}${date}${statusLabel}`)
      })
    }
    
    if (items.length === 0) return null
    
    return { title: "Patient's Conditions", items }
  }
}
