/**
 * Composition root for the care packs.
 *
 * The registry mechanics live in `@voho0000/personalized-care/registry`, whose
 * main entry stays side-effect-free. The host — this app — is what decides
 * which packs are registered, under which source name, and which one is the
 * default, so that one call stays here: enabling a pack is an app change, not a
 * package release.
 *
 * Visibility is decided here too. The package's own getters filter on
 * `pack.enabled` and take no argument, so they cannot be told about a pilot id;
 * rather than reach into the package or register mutated copies (which would
 * have to happen before the URL is read), the host answers from `CARE_PACKS`
 * with its own predicate. `registerCarePacks` still runs for what only it can
 * do: validate every pack against the contract and resolve the default pack.
 */
import {
  getDefaultClinicalGuidelinePack,
  registerCarePacks,
} from '@voho0000/personalized-care/registry'
import { CARE_PACKS, DEFAULT_CARE_PACK_ID } from '@voho0000/personalized-care'
import { isPilotPack } from './pilot-gate'
import type { CdssPatientProfile, ClinicalGuidelinePack } from '../types'

registerCarePacks(CARE_PACKS, {
  source: 'medical-note-smart-on-fhir/bundled-care-packs',
  defaultPackId: DEFAULT_CARE_PACK_ID,
})

// A pack is visible when the package released it, or when this browser was
// handed it as a pilot. Evaluated per call, so turning a pilot pack on takes
// effect without reloading the module graph.
function isVisible(pack: ClinicalGuidelinePack): boolean {
  return pack.enabled || isPilotPack(pack.id)
}

export function getEnabledClinicalGuidelinePacks(): readonly ClinicalGuidelinePack[] {
  return CARE_PACKS.filter(isVisible)
}

export function getClinicalGuidelinePack(id: string): ClinicalGuidelinePack | undefined {
  const pack = CARE_PACKS.find((candidate) => candidate.id === id)
  return pack && isVisible(pack) ? pack : undefined
}

export function getApplicableClinicalGuidelinePacks(
  profile: CdssPatientProfile,
): readonly ClinicalGuidelinePack[] {
  return getEnabledClinicalGuidelinePacks().filter((pack) => pack.applies(profile))
}

export { getDefaultClinicalGuidelinePack }
