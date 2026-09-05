/**
 * Composition root for the care packs.
 *
 * The registry mechanics live in `@voho0000/personalized-care/registry`, whose
 * main entry stays side-effect-free. The host — this app — is what decides
 * which packs are registered, under which source name, and which one is the
 * default, so that one call stays here: enabling a pack is an app change, not a
 * package release.
 *
 * The switcher is decided here too. The package's own getters filter on
 * `pack.enabled` and take no argument, so they can be told neither which packs
 * this host lists nor which gates it applies; rather than reach into the
 * package or register mutated copies, the host answers from its own list with
 * its own predicate. `registerCarePacks` still runs for what only it can do:
 * validate every pack against the contract.
 *
 * Two host decisions live below, and they are separate questions.
 *
 * WHICH packs: `HOST_PACK_ORDER` is the switcher, and nothing outside it is
 * reachable. The package carries ten written packs; this app currently shows
 * heart failure and CKD, in that order. A pack the package adds does not appear
 * here until it is named in that list — the package proposes, the host decides.
 *
 * WHETHER a listed pack shows: the Beta switch. The 個人化照護指引 tab is
 * already `beta: true`, so the only people who reach this list are signed-in
 * users who turned Beta features on in Settings — exactly the audience the
 * unreleased packs were written for. Making them ask for a URL parameter on top
 * of that was a second lock on the same door, so Beta alone now opens it, and
 * the per-pack pilot ids stay as the way in while Beta is off.
 */
import { PersonalizationSdkError } from '@voho0000/personalization-sdk'
import { registerCarePacks } from '@voho0000/personalized-care/registry'
import { CARE_PACKS } from '@voho0000/personalized-care'
import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'
import { isBetaFeaturesEnabledInBrowser } from '@/src/application/stores/beta-features.store'
import { isPilotPack } from './pilot-gate'
import type { CdssPatientProfile, ClinicalGuidelinePack } from '../types'

/**
 * The disease switcher: exactly these packs, in exactly this order. Heart
 * failure leads, CKD follows; every other pack the package ships — diabetes-CKD
 * included — is hidden here whatever the Beta switch, a pilot id, or the route
 * says.
 */
const HOST_PACK_ORDER = ['heart-failure-cdss', 'ckd-cdss'] as const

/**
 * The default the package validates against. It must be a released pack, and
 * heart failure is still `enabled: false`, so CKD carries that role — what the
 * switcher actually opens on is decided by `getDefaultClinicalGuidelinePack`
 * below, which follows the host order and the visibility rule instead.
 */
const HOST_DEFAULT_PACK_ID = 'ckd-cdss'

// Every pack is registered, not just the listed ones: registration is what
// validates each pack against the contract, and a pack that fails the contract
// should be caught the release it lands in, not the release it is listed in.
registerCarePacks(CARE_PACKS, {
  source: 'medical-note-smart-on-fhir/bundled-care-packs',
  defaultPackId: HOST_DEFAULT_PACK_ID,
})

const HOST_PACKS: readonly ClinicalGuidelinePack[] = HOST_PACK_ORDER.map((id) => {
  const pack = CARE_PACKS.find((candidate) => candidate.id === id)
  if (!pack) {
    // A listed pack the package no longer carries is a wiring mistake, and a
    // silently shorter switcher is the worst way to find out about it.
    throw new PersonalizationSdkError(
      'INVALID_PACK',
      `Care pack "${id}" is listed by the host but not shipped by the package`,
      { packId: id },
    )
  }
  return pack
})

/** The packs this host lists, in switcher order, before the visibility gate. */
export const HOST_CARE_PACKS = HOST_PACKS

// A pack is visible when the package released it, when this browser has Beta
// features on, or when it was handed to this browser as a single pilot id.
//
// The unattended Medcloud hand-off is outside the Beta term as well as the
// pilot one: that route shows released guidance only, whatever a tester left
// switched on in this browser earlier.
//
// Evaluated per call — nothing here is cached — so a pack appears the moment
// the Beta switch is flipped, with no reload and no module-graph reset.
function isVisible(pack: ClinicalGuidelinePack): boolean {
  if (pack.enabled) return true
  if (isMedcloudLaunchRoute()) return false
  return isBetaFeaturesEnabledInBrowser() || isPilotPack(pack.id)
}

export function getEnabledClinicalGuidelinePacks(): readonly ClinicalGuidelinePack[] {
  return HOST_PACKS.filter(isVisible)
}

export function getClinicalGuidelinePack(id: string): ClinicalGuidelinePack | undefined {
  const pack = HOST_PACKS.find((candidate) => candidate.id === id)
  return pack && isVisible(pack) ? pack : undefined
}

export function getApplicableClinicalGuidelinePacks(
  profile: CdssPatientProfile,
): readonly ClinicalGuidelinePack[] {
  return getEnabledClinicalGuidelinePacks().filter((pack) => pack.applies(profile))
}

/**
 * What the switcher opens on when this record activates nothing: the first pack
 * the host lists that is visible. CKD is always released, so this always has an
 * answer. The applicable-first rule lives in the feature, which is the only
 * place that has a profile to test.
 */
export function getDefaultClinicalGuidelinePack(): ClinicalGuidelinePack {
  const [first] = getEnabledClinicalGuidelinePacks()
  if (!first) {
    throw new PersonalizationSdkError(
      'DEFAULT_PACK_NOT_FOUND',
      'No care pack listed by the host is visible',
      { hostPackOrder: [...HOST_PACK_ORDER] },
    )
  }
  return first
}
