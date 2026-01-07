// Allergies Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'

interface Allergy {
  code?: { text?: string }
}

export const allergiesCategory: DataCategory<Allergy> = {
  id: 'allergies',
  label: 'Allergies',
  labelKey: 'dataSelection.allergies',
  description: 'Known allergies and intolerances',
  descriptionKey: 'dataSelection.allergiesDesc',
  group: 'clinical',
  order: 30,
  
  extractData: (clinicalData) => clinicalData?.allergies || [],
  
  getCount: (data) => data.length,
  
  getContextSection: (data): ClinicalContextSection | null => {
    if (data.length === 0) return null
    
    const items = data
      .map(a => a.code?.text || 'Unknown allergy')
      .filter(Boolean)
    
    if (items.length === 0) return null
    
    return { title: "Patient's Allergies", items }
  }
}
