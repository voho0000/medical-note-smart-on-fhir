/**
 * The composition root is what decides which care packs a browser sees. Without
 * a pilot id it must be exactly the packs the package released — a pack that
 * leaks into the switcher is guidance nobody signed off on.
 */
let mockMedcloudLaunchRoute = false

jest.mock('@/src/application/launch/medcloud-launch-route', () => ({
  isMedcloudLaunchRoute: () => mockMedcloudLaunchRoute,
}))

import { DEFAULT_CARE_PACK_ID } from '@voho0000/personalized-care'
import {
  getClinicalGuidelinePack,
  getDefaultClinicalGuidelinePack,
  getEnabledClinicalGuidelinePacks,
} from '@/features/clinical-decision-support/guideline-packs/registry'
import { writePilotPackIds } from '@/features/clinical-decision-support/guideline-packs/pilot-gate'

const RELEASED_PACK_IDS = ['ckd-cdss', 'dm-ckd-cdss']

describe('care pack visibility', () => {
  beforeEach(() => {
    mockMedcloudLaunchRoute = false
    window.localStorage.clear()
  })

  it('shows only the released packs when no pilot pack is set', () => {
    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).toEqual(RELEASED_PACK_IDS)
    expect(getClinicalGuidelinePack('heart-failure-cdss')).toBeUndefined()
  })

  it('adds a pilot pack for the browser that was handed it', () => {
    writePilotPackIds(['heart-failure-cdss'])

    const ids = getEnabledClinicalGuidelinePacks().map((pack) => pack.id)
    expect(ids).toContain('heart-failure-cdss')
    expect(ids).toEqual(expect.arrayContaining(RELEASED_PACK_IDS))
    expect(getClinicalGuidelinePack('heart-failure-cdss')?.id).toBe('heart-failure-cdss')
    // Still marked unreleased, which is what the 試辦 chip reads.
    expect(getClinicalGuidelinePack('heart-failure-cdss')?.enabled).toBe(false)
  })

  it('keeps the switcher order the package declared', () => {
    writePilotPackIds(['heart-failure-cdss'])

    const ids = getEnabledClinicalGuidelinePacks().map((pack) => pack.id)
    expect(ids.indexOf('ckd-cdss')).toBeLessThan(ids.indexOf('heart-failure-cdss'))
  })

  it('ignores an unknown pilot id', () => {
    writePilotPackIds(['not-a-pack'])

    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).toEqual(RELEASED_PACK_IDS)
  })

  it('shows no pilot pack on the Medcloud launch route', () => {
    writePilotPackIds(['heart-failure-cdss'])
    mockMedcloudLaunchRoute = true

    expect(getEnabledClinicalGuidelinePacks().map((pack) => pack.id)).toEqual(RELEASED_PACK_IDS)
    expect(getClinicalGuidelinePack('heart-failure-cdss')).toBeUndefined()
  })

  it('leaves the default pack alone', () => {
    writePilotPackIds(['heart-failure-cdss'])

    expect(getDefaultClinicalGuidelinePack().id).toBe(DEFAULT_CARE_PACK_ID)
  })
})
