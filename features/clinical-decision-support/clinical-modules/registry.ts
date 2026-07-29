import type {
  CdssClinicalModule,
  CdssLocale,
  CdssPatientProfile,
  CdssRecommendation,
} from '../types'
import { DCSI_CLINICAL_MODULE } from './dcsi-module'
import { IMMUNIZATION_CLINICAL_MODULE } from './immunization-module'

// Removing or disabling an entry cleanly removes that clinical module without
// changing patient normalization, guideline packs, or the shared renderer.
const clinicalModules: readonly CdssClinicalModule[] = [
  DCSI_CLINICAL_MODULE,
  IMMUNIZATION_CLINICAL_MODULE,
]

export function getEnabledClinicalModules(): readonly CdssClinicalModule[] {
  return clinicalModules.filter((module) => module.enabled)
}

export function buildEnabledClinicalModules(input: {
  profile: CdssPatientProfile
  locale: CdssLocale
}): CdssRecommendation[] {
  return getEnabledClinicalModules().flatMap((module) => {
    const recommendation = module.build(input)
    return recommendation ? [recommendation] : []
  })
}
