// Encounters Category
// Encounter-centric view: each visit grouped with its diagnoses, medications,
// tests, and procedures. The actual context generation lives in
// useEncountersContext (see clinical-context hooks). This category exists for
// the data-selection UI (count, label, toggle).
import type { DataCategory } from '../interfaces/data-category.interface'

export const encountersCategory: DataCategory<any> = {
  id: 'encounters',
  label: 'Visits',
  labelKey: 'dataSelection.encounters',
  description: 'Encounter-centric: each visit with its diagnoses, medications, tests',
  descriptionKey: 'dataSelection.encountersDesc',
  group: 'visit',
  order: 5,

  filters: [],

  extractData: (clinicalData) => clinicalData?.encounters || [],

  getCount: (data) => data.length,

  // Context generation handled by useEncountersContext hook in aggregator.
  // Returning null here means the registry path is bypassed; the legacy hook
  // path produces the actual section text.
  getContextSection: () => null,
}
