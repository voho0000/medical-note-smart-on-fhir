// Data Categories Index
// Register all categories here

import { dataCategoryRegistry, registerDataCategory } from '../registry/data-category.registry'
import { patientInfoCategory } from './patient-info.category'
import { vitalSignsCategory } from './vital-signs.category'
import { problemListCategory } from './problem-list.category'
import { encountersCategory } from './encounters.category'
import { labReportsCategory } from './lab-reports.category'
import { imagingReportsCategory } from './imaging-reports.category'
import { proceduresCategory } from './procedures.category'
import { medicationsCategory } from './medications.category'
import { allergiesCategory } from './allergies.category'
import { immunizationsCategory } from './immunizations.category'
import { advanceDirectivesCategory } from './consent.category'
import { medicalDevicesCategory } from './device.category'
import { carePlansCategory } from './care-plan.category'
import { documentsCategory } from './composition.category'

export function initializeCategories(): void {
  // Legacy catch-all "Other Observations" is no longer a user-facing category.
  // Standalone result observations are folded into Lab Reports instead.
  dataCategoryRegistry.unregister('observations')

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
  medicationsCategory,
  allergiesCategory,
  immunizationsCategory,
  advanceDirectivesCategory,
  medicalDevicesCategory,
  carePlansCategory,
  documentsCategory
}
