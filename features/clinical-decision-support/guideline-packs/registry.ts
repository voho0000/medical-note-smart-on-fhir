/**
 * Composition root for the care packs.
 *
 * The registry mechanics live in `@voho0000/personalized-care/registry`, whose
 * main entry stays side-effect-free. The host — this app — is what decides
 * which packs are registered, under which source name, and which one is the
 * default, so that one call stays here: enabling a pack is an app change, not a
 * package release.
 */
import {
  getApplicableClinicalGuidelinePacks,
  getClinicalGuidelinePack,
  getDefaultClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
  registerCarePacks,
} from '@voho0000/personalized-care/registry'
import { CARE_PACKS, DEFAULT_CARE_PACK_ID } from '@voho0000/personalized-care'

registerCarePacks(CARE_PACKS, {
  source: 'medical-note-smart-on-fhir/bundled-care-packs',
  defaultPackId: DEFAULT_CARE_PACK_ID,
})

export {
  getApplicableClinicalGuidelinePacks,
  getClinicalGuidelinePack,
  getDefaultClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
}
