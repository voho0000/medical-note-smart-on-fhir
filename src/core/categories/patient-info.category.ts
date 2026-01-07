// Patient Info Category
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'

export const patientInfoCategory: DataCategory = {
  id: 'patientInfo',
  label: 'Patient Information',
  labelKey: 'dataSelection.patientInfo',
  description: 'Basic demographic and contact information',
  descriptionKey: 'dataSelection.patientInfoDesc',
  group: 'patient',
  order: 0,
  
  extractData: (clinicalData) => {
    // Patient info is handled separately via usePatientContext
    // Return empty array as count is always 1
    return []
  },
  
  getCount: () => 1,
  
  getContextSection: (): ClinicalContextSection | null => {
    // Patient context is handled by usePatientContext hook
    // This is a placeholder - actual implementation uses FHIR patient data
    return null
  }
}
