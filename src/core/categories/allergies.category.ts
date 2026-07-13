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
    
    const statusCode = (status: any): string =>
      typeof status === 'string' ? status : status?.coding?.[0]?.code || 'unknown'
    const items = data
      .map((allergy: any) => {
        const clinical = statusCode(allergy.clinicalStatus)
        const verification = statusCode(allergy.verificationStatus)
        const invalid = ['refuted', 'entered-in-error'].includes(verification.toLowerCase())
          ? ' — NOT a verified active allergy'
          : ''
        const reactions = (allergy.reaction ?? []).flatMap((reaction: any) => {
          const manifestations = (reaction.manifestation ?? [])
            .map((item: any) => item?.text || item?.coding?.[0]?.display)
            .filter(Boolean)
          const text = reaction.description || manifestations.join(', ')
          return text ? [`reaction=${text}${reaction.severity ? `; severity=${reaction.severity}` : ''}`] : []
        })
        return `${allergy.code?.text || allergy.code?.coding?.[0]?.display || 'Unknown allergy'} [clinical=${clinical}; verification=${verification}; criticality=${allergy.criticality || 'unknown'}]${invalid}${reactions.length ? `; ${reactions.join('; ')}` : ''}`
      })
      .filter(Boolean)
    
    if (items.length === 0) return null
    
    return { title: "Patient's Allergies", items }
  }
}
