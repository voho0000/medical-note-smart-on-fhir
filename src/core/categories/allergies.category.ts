// Allergies Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { AllergyIntolerance } from '@/src/shared/types/fhir.types'

export const allergiesCategory: DataCategory<AllergyIntolerance> = {
  id: 'allergies',
  label: 'Allergies',
  labelKey: 'dataSelection.allergies',
  description: 'Known allergies and intolerances',
  descriptionKey: 'dataSelection.allergiesDesc',
  group: 'medication',
  order: 31,
  
  extractData: (clinicalData) => clinicalData?.allergies || [],
  
  getCount: (data) => data.length,
  
  getContextSection: (data): ClinicalContextSection | null => {
    if (data.length === 0) return null
    
    const items = data
      .map((allergy: any) => {
        const reactions = (allergy.reaction ?? []).flatMap((reaction: any) => {
          const manifestations = (reaction.manifestation ?? [])
            .map((item: any) => item?.text || item?.coding?.[0]?.display)
            .filter(Boolean)
          const text = reaction.description || manifestations.join(', ')
          return text ? [`reaction=${text}${reaction.severity ? `; severity=${reaction.severity}` : ''}`] : []
        })
        const criticality = allergy.criticality ? ` [criticality=${allergy.criticality}]` : ''
        return `${allergy.code?.text || allergy.code?.coding?.[0]?.display || 'Unknown allergy'}${criticality}${reactions.length ? `; ${reactions.join('; ')}` : ''}`
      })
      .filter(Boolean)
    
    if (items.length === 0) return null
    
    return { title: "Patient's Allergies", items }
  }
}
