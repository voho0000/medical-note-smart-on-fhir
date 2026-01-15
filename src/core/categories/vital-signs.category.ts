// Vital Signs Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { Observation } from '@/src/shared/types/fhir.types'
import { isWithinTimeRange } from '../utils/date-filter.utils'
import { getCodeableConceptText } from '../utils/data-grouping.utils'
import { VitalSignsFilter } from '@/features/data-selection/components/DataFilters'

const getVitalSignType = (obs: Observation): string => {
  let type = obs.code?.text || obs.code?.coding?.[0]?.display
  
  if (!type && Array.isArray(obs.component) && obs.component.length > 0) {
    const componentCodes = obs.component
      .map(c => c.code?.text || c.code?.coding?.[0]?.display)
      .filter(Boolean)
    if (componentCodes.some(c => c?.toLowerCase().includes('blood pressure'))) {
      type = 'Blood Pressure'
    }
  }
  
  return type || 'Vital Sign'
}

export const vitalSignsCategory: DataCategory<Observation> = {
  id: 'observations',
  label: 'Vital Signs',
  labelKey: 'dataSelection.observations',
  description: 'Vital signs and measurements',
  descriptionKey: 'dataSelection.observationsDesc',
  group: 'clinical',
  order: 70,
  
  filters: [
    {
      key: 'vitalSignsVersion',
      type: 'select',
      label: 'Version',
      options: [
        { value: 'latest', label: 'Latest Only' },
        { value: 'all', label: 'All Readings' }
      ],
      defaultValue: 'latest'
    },
    {
      key: 'vitalSignsTimeRange',
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
  
  FilterComponent: VitalSignsFilter,
  
  extractData: (clinicalData) => clinicalData?.vitalSigns || [],
  
  getCount: (data, filters) => {
    let filtered = data
    
    const timeRange = filters.vitalSignsTimeRange as string
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(obs => isWithinTimeRange(obs.effectiveDateTime, timeRange))
    }
    
    if (filters.vitalSignsVersion === 'latest') {
      const byType = new Map<string, Observation>()
      filtered.forEach(obs => {
        const type = getVitalSignType(obs)
        const existing = byType.get(type)
        if (!existing || (obs.effectiveDateTime || '') > (existing.effectiveDateTime || '')) {
          byType.set(type, obs)
        }
      })
      filtered = Array.from(byType.values())
    }
    
    return filtered.length
  },
  
  getContextSection: (data, filters): ClinicalContextSection[] => {
    if (data.length === 0) {
      return []
    }
    
    // Deduplicate by id
    const uniqueData = Array.from(new Map(data.map(v => [v.id, v])).values())
    
    let filtered = uniqueData
    const timeRange = filters.vitalSignsTimeRange as string
    if (timeRange && timeRange !== 'all') {
      filtered = filtered.filter(obs => isWithinTimeRange(obs.effectiveDateTime, timeRange))
    }
    
    if (filtered.length === 0) {
      return [{ title: 'Vital Signs', items: ['No vital signs found within the selected time range.'] }]
    }
    
    // Group by type
    const byType = new Map<string, Observation[]>()
    filtered.forEach(obs => {
      const type = getVitalSignType(obs)
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type)!.push(obs)
    })
    
    const sections: ClinicalContextSection[] = []
    
    byType.forEach((observations, type) => {
      const sorted = [...observations].sort((a, b) => 
        (b.effectiveDateTime || '').localeCompare(a.effectiveDateTime || '')
      )
      
      const observationsToShow = filters.vitalSignsVersion === 'all' 
        ? sorted 
        : [sorted[0]]
      
      const items: string[] = []
      
      observationsToShow.forEach(obs => {
        const date = obs.effectiveDateTime 
          ? new Date(obs.effectiveDateTime).toLocaleString('zh-TW', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
          : ''
        
        if (Array.isArray(obs.component) && obs.component.length > 0) {
          const componentValues = obs.component
            .map(comp => {
              const compValue = comp.valueQuantity?.value
              const compUnit = comp.valueQuantity?.unit || ''
              const compCode = comp.code?.text || comp.code?.coding?.[0]?.display || ''
              if (compValue !== undefined && compValue !== null) {
                return `${compCode}: ${compValue} ${compUnit}`.trim()
              }
              return null
            })
            .filter(Boolean)
          
          if (componentValues.length > 0) {
            items.push(`${componentValues.join(', ')}${date ? ` (${date})` : ''}`)
          }
        } else {
          const value = obs.valueQuantity?.value ?? obs.valueString
          const unit = obs.valueQuantity?.unit ?? ''
          if (value !== undefined && value !== null) {
            items.push(`${String(value)} ${unit}${date ? ` (${date})` : ''}`.trim())
          }
        }
      })
      
      if (items.length > 0) {
        sections.push({ title: type, items })
      }
    })
    
    return sections
  }
}
