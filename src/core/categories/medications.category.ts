// Medications Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import { MedicationFilter } from '@/features/data-selection/components/DataFilters'

interface Medication {
  medicationCodeableConcept?: { text?: string }
  status?: string
  authoredOn?: string
}

const isActiveMedication = (med: Medication): boolean => {
  return med.status === 'active' || med.status === 'completed'
}

export const medicationsCategory: DataCategory<Medication> = {
  id: 'medications',
  label: 'Medications',
  labelKey: 'dataSelection.medications',
  description: 'Current and past medications',
  descriptionKey: 'dataSelection.medicationsDesc',
  group: 'medication',
  order: 20,
  
  filters: [
    {
      key: 'medicationStatus',
      type: 'select',
      label: 'Medication Status',
      options: [
        { value: 'active', label: 'Active Only' },
        { value: 'all', label: 'All Medications' }
      ],
      defaultValue: 'active'
    }
  ],
  
  FilterComponent: MedicationFilter,
  
  extractData: (clinicalData) => clinicalData?.medications || [],
  
  getCount: (data, filters) => {
    if (filters.medicationStatus === 'active') {
      return data.filter(isActiveMedication).length
    }
    return data.length
  },
  
  getContextSection: (data, filters): ClinicalContextSection | null => {
    if (data.length === 0) return null
    
    const filtered = filters.medicationStatus === 'all' 
      ? data 
      : data.filter(isActiveMedication)
    
    if (filtered.length === 0) return null
    
    const activeMeds = filtered.filter(isActiveMedication)
    const stoppedMeds = filtered.filter(m => !isActiveMedication(m))
    
    const items: string[] = []
    
    if (activeMeds.length > 0) {
      items.push('Active Medications:')
      activeMeds.forEach(m => {
        const name = m.medicationCodeableConcept?.text || 'Unknown medication'
        const date = m.authoredOn 
          ? ` (started: ${new Date(m.authoredOn).toLocaleDateString()})` 
          : ''
        items.push(`  • ${name}${date}`)
      })
    }
    
    if (stoppedMeds.length > 0) {
      if (items.length > 0) items.push('')
      items.push('Stopped Medications:')
      stoppedMeds.forEach(m => {
        const name = m.medicationCodeableConcept?.text || 'Unknown medication'
        const date = m.authoredOn 
          ? ` (${new Date(m.authoredOn).toLocaleDateString()})` 
          : ''
        const status = m.status ? ` [${m.status}]` : ''
        items.push(`  • ${name}${date}${status}`)
      })
    }
    
    if (items.length === 0) return null
    
    return { title: "Patient's Medications", items }
  }
}
