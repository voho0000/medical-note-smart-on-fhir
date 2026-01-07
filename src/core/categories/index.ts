// Data Categories Index
// Register all categories here

import { registerDataCategory } from '../registry/data-category.registry'
import { patientInfoCategory } from './patient-info.category'
import { conditionsCategory } from './conditions.category'
import { medicationsCategory } from './medications.category'
import { allergiesCategory } from './allergies.category'
import { labReportsCategory } from './lab-reports.category'
import { imagingReportsCategory } from './imaging-reports.category'
import { proceduresCategory } from './procedures.category'
import { vitalSignsCategory } from './vital-signs.category'

// Register all categories
export function initializeCategories(): void {
  registerDataCategory(patientInfoCategory)
  registerDataCategory(conditionsCategory)
  registerDataCategory(medicationsCategory)
  registerDataCategory(allergiesCategory)
  registerDataCategory(labReportsCategory)
  registerDataCategory(imagingReportsCategory)
  registerDataCategory(proceduresCategory)
  registerDataCategory(vitalSignsCategory)
}

// Export individual categories for direct access if needed
export {
  patientInfoCategory,
  conditionsCategory,
  medicationsCategory,
  allergiesCategory,
  labReportsCategory,
  imagingReportsCategory,
  proceduresCategory,
  vitalSignsCategory
}
