// Data Categories Index
// Register all categories here

import { registerDataCategory } from '../registry/data-category.registry'
import { patientInfoCategory } from './patient-info.category'
import { vitalSignsCategory } from './vital-signs.category'
import { problemListCategory } from './problem-list.category'
import { encountersCategory } from './encounters.category'
import { labReportsCategory } from './lab-reports.category'
import { imagingReportsCategory } from './imaging-reports.category'
import { proceduresCategory } from './procedures.category'
import { observationsCategory } from './observations.category'
import { medicationsCategory } from './medications.category'
import { allergiesCategory } from './allergies.category'
import { immunizationsCategory } from './immunizations.category'
import { advanceDirectivesCategory } from './consent.category'
import { medicalDevicesCategory } from './device.category'
import { carePlansCategory } from './care-plan.category'
import { documentsCategory } from './composition.category'

export function initializeCategories(): void {
  // Patient group
  registerDataCategory(patientInfoCategory)
  registerDataCategory(vitalSignsCategory)
  registerDataCategory(problemListCategory)
  registerDataCategory(advanceDirectivesCategory)
  registerDataCategory(medicalDevicesCategory)
  registerDataCategory(carePlansCategory)

  // Visit group
  registerDataCategory(encountersCategory)

  // Reports group
  registerDataCategory(labReportsCategory)
  registerDataCategory(imagingReportsCategory)
  registerDataCategory(proceduresCategory)
  registerDataCategory(observationsCategory)

  // Medication group
  registerDataCategory(medicationsCategory)
  registerDataCategory(allergiesCategory)
  registerDataCategory(immunizationsCategory)

  // Documents group
  registerDataCategory(documentsCategory)
}

export {
  patientInfoCategory,
  vitalSignsCategory,
  problemListCategory,
  encountersCategory,
  labReportsCategory,
  imagingReportsCategory,
  proceduresCategory,
  observationsCategory,
  medicationsCategory,
  allergiesCategory,
  immunizationsCategory,
  advanceDirectivesCategory,
  medicalDevicesCategory,
  carePlansCategory,
  documentsCategory
}
