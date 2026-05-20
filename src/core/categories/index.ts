// Data Categories Index
// Register all categories here

import { registerDataCategory } from '../registry/data-category.registry'
import { patientInfoCategory } from './patient-info.category'
import { vitalSignsCategory } from './vital-signs.category'
import { problemListCategory } from './problem-list.category'
import { encountersCategory } from './encounters.category'
import { conditionsCategory } from './conditions.category'
import { labReportsCategory } from './lab-reports.category'
import { imagingReportsCategory } from './imaging-reports.category'
import { proceduresCategory } from './procedures.category'
import { observationsCategory } from './observations.category'
import { medicationsCategory } from './medications.category'
import { allergiesCategory } from './allergies.category'
import { immunizationsCategory } from './immunizations.category'

export function initializeCategories(): void {
  // Patient group
  registerDataCategory(patientInfoCategory)
  registerDataCategory(vitalSignsCategory)
  registerDataCategory(problemListCategory)

  // Visit group
  registerDataCategory(encountersCategory)
  registerDataCategory(conditionsCategory)

  // Reports group
  registerDataCategory(labReportsCategory)
  registerDataCategory(imagingReportsCategory)
  registerDataCategory(proceduresCategory)
  registerDataCategory(observationsCategory)

  // Medication group
  registerDataCategory(medicationsCategory)
  registerDataCategory(allergiesCategory)
  registerDataCategory(immunizationsCategory)
}

export {
  patientInfoCategory,
  vitalSignsCategory,
  problemListCategory,
  encountersCategory,
  conditionsCategory,
  labReportsCategory,
  imagingReportsCategory,
  proceduresCategory,
  observationsCategory,
  medicationsCategory,
  allergiesCategory,
  immunizationsCategory
}
