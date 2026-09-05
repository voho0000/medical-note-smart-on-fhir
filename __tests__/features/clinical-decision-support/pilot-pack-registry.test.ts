/**
 * The composition root is what decides which care packs a browser sees, and it
 * decides two things.
 *
 * WHICH: the host lists heart failure then CKD, and nothing else the package
 * ships is reachable — a pack that leaks into the switcher is guidance nobody
 * signed off on.
 *
 * WHETHER: heart failure is still unreleased, so it shows to the audience the
 * 個人化照護指引 tab is already gated to — any visitor with Beta features on, no
 * account required — or to a browser handed its pilot id while Beta is off. The
 * unattended Medcloud hand-off is outside both and gets released guidance only.
 */
let mockMedcloudLaunchRoute = false

jest.mock('@/src/application/launch/medcloud-launch-route', () => ({
  isMedcloudLaunchRoute: () => mockMedcloudLaunchRoute,
}))

import {
  HOST_CARE_PACKS,
  getClinicalGuidelinePack,
  getDefaultClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from '@/features/clinical-decision-support/guideline-packs/registry'
import { writePilotPackIds } from '@/features/clinical-decision-support/guideline-packs/pilot-gate'
import {
  GUEST_BETA_FEATURES_KEY,
  useBetaFeaturesStore,
} from '@/src/application/stores/beta-features.store'

/** What the host lists, in switcher order. */
const HOST_PACK_IDS = ['heart-failure-cdss', 'ckd-cdss']
/** What a browser sees with nothing turned on: the released half of that list. */
const RELEASED_PACK_IDS = ['ckd-cdss']
/** Written and registered, but not listed by this host — never reachable. */
const UNLISTED_PACK_IDS = [
  'dm-ckd-cdss',
  'hypertension-cdss',
  'hyperlipidemia-cdss',
  'cirrhosis-cdss',
  'aki-alert-cdss',
  'renal-safety-cdss',
  'atrial-fibrillation-cdss',
  'ckd-anemia-cdss',
]

function visibleIds(): string[] {
  return getEnabledClinicalGuidelinePacks().map((pack) => pack.id)
}

function enableBeta(): void {
  useBetaFeaturesStore.getState().setBetaFeaturesEnabled('user-a', true)
}

describe('care pack visibility', () => {
  beforeEach(() => {
    mockMedcloudLaunchRoute = false
    window.localStorage.clear()
    useBetaFeaturesStore.setState({ enabledByUser: {} })
  })

  it('lists heart failure first and CKD second, and nothing else', () => {
    expect(HOST_CARE_PACKS.map((pack) => pack.id)).toEqual(HOST_PACK_IDS)
  })

  it('shows only the released listed pack with Beta off and no pilot id', () => {
    expect(visibleIds()).toEqual(RELEASED_PACK_IDS)
    expect(getClinicalGuidelinePack('heart-failure-cdss')).toBeUndefined()
  })

  it('shows heart failure ahead of CKD once Beta features are on', () => {
    enableBeta()

    expect(visibleIds()).toEqual(['heart-failure-cdss', 'ckd-cdss'])
    expect(getClinicalGuidelinePack('heart-failure-cdss')?.id).toBe('heart-failure-cdss')
  })

  it('shows both listed packs to a signed-out visitor who turned Beta on', () => {
    // Beta no longer asks for an account, so the switch a guest browser flipped
    // is stored under the guest key — and the switcher must read it exactly as
    // it reads a signed-in account's.
    useBetaFeaturesStore.getState().setBetaFeaturesEnabled(GUEST_BETA_FEATURES_KEY, true)

    expect(visibleIds()).toEqual(['heart-failure-cdss', 'ckd-cdss'])
  })

  it('leaves a Beta-revealed pack marked unreleased, which is what the 試辦 chip reads', () => {
    enableBeta()

    expect(getClinicalGuidelinePack('heart-failure-cdss')?.enabled).toBe(false)
    expect(getClinicalGuidelinePack('ckd-cdss')?.enabled).toBe(true)
  })

  it('never shows a pack this host does not list', () => {
    enableBeta()
    writePilotPackIds(UNLISTED_PACK_IDS)

    expect(visibleIds()).toEqual(HOST_PACK_IDS)
    for (const id of UNLISTED_PACK_IDS) {
      expect(getClinicalGuidelinePack(id)).toBeUndefined()
    }
  })

  it('answers per call, so flipping the switch takes effect without a reload', () => {
    // Nothing may cache the pre-hydration answer: the module graph loads long
    // before the persisted Beta value is read back, and a user can flip the
    // switch mid-session.
    expect(visibleIds()).toEqual(RELEASED_PACK_IDS)

    enableBeta()
    expect(visibleIds()).toEqual(HOST_PACK_IDS)

    useBetaFeaturesStore.getState().setBetaFeaturesEnabled('user-a', false)
    expect(visibleIds()).toEqual(RELEASED_PACK_IDS)
  })

  it('adds the pilot pack this browser was handed while Beta is off', () => {
    writePilotPackIds(['heart-failure-cdss'])

    expect(visibleIds()).toEqual(HOST_PACK_IDS)
    expect(getClinicalGuidelinePack('heart-failure-cdss')?.id).toBe('heart-failure-cdss')
    // Still marked unreleased, which is what the 試辦 chip reads.
    expect(getClinicalGuidelinePack('heart-failure-cdss')?.enabled).toBe(false)
  })

  it('ignores an unknown pilot id', () => {
    writePilotPackIds(['not-a-pack'])

    expect(visibleIds()).toEqual(RELEASED_PACK_IDS)
  })

  it('shows no pilot pack on the Medcloud launch route', () => {
    writePilotPackIds(['heart-failure-cdss'])
    mockMedcloudLaunchRoute = true

    expect(visibleIds()).toEqual(RELEASED_PACK_IDS)
    expect(getClinicalGuidelinePack('heart-failure-cdss')).toBeUndefined()
  })

  it('shows no held-back pack on the Medcloud launch route even with Beta on', () => {
    enableBeta()
    mockMedcloudLaunchRoute = true

    expect(visibleIds()).toEqual(RELEASED_PACK_IDS)
    expect(getClinicalGuidelinePack('heart-failure-cdss')).toBeUndefined()
  })
})

describe('care pack default', () => {
  beforeEach(() => {
    mockMedcloudLaunchRoute = false
    window.localStorage.clear()
    useBetaFeaturesStore.setState({ enabledByUser: {} })
  })

  it('falls back to the first pack the host lists that is visible', () => {
    // Beta off: heart failure is not visible, so the fallback is CKD.
    expect(getDefaultClinicalGuidelinePack().id).toBe('ckd-cdss')

    enableBeta()
    expect(getDefaultClinicalGuidelinePack().id).toBe('heart-failure-cdss')
  })
})
