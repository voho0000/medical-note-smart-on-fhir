// Documents Category (FHIR Composition + DocumentReference)
//
// Unlike the other categories, documents are selected per-document (the user
// ticks which ones), not via scalar filters — so the actual text is assembled
// in use-clinical-context.hook from the per-consumer documentMode/documentIds
// using the shared core helper. This category exists for the on/off toggle and
// the count badge; getContextSection is a registry fallback (all docs).
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import { listClinicalDocuments, formatDocumentsSection } from '../utils/clinical-documents.utils'

export const documentsCategory: DataCategory = {
  id: 'documents',
  label: 'Documents',
  labelKey: 'dataSelection.documents',
  description: 'Discharge summaries, IPS and other documents (full text)',
  descriptionKey: 'dataSelection.documentsDesc',
  group: 'documents',
  order: 70,

  extractData: (clinicalData) => listClinicalDocuments(clinicalData),

  getCount: (data) => data.length,

  getContextSection: (data): ClinicalContextSection | null =>
    formatDocumentsSection(data as ReturnType<typeof listClinicalDocuments>),
}
