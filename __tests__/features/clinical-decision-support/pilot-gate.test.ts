/**
 * The host-side pilot gate: a URL switch that shows a tester a care pack the
 * package ships disabled, without cutting a package release.
 */
let mockMedcloudLaunchRoute = false

jest.mock('@/src/application/launch/medcloud-launch-route', () => ({
  isMedcloudLaunchRoute: () => mockMedcloudLaunchRoute,
}))

import {
  PILOT_PACK_STORAGE_KEY,
  applyPilotPackIdsFromUrl,
  isPilotPack,
  readPilotPackIds,
  writePilotPackIds,
} from '@/features/clinical-decision-support/guideline-packs/pilot-gate'

describe('pilot gate', () => {
  beforeEach(() => {
    mockMedcloudLaunchRoute = false
    window.localStorage.clear()
  })

  it('reads the pack ids out of the URL and persists them for this browser', () => {
    const ids = applyPilotPackIdsFromUrl('?pilotPacks=heart-failure-cdss,atrial-fibrillation-cdss')

    expect(ids).toEqual(['heart-failure-cdss', 'atrial-fibrillation-cdss'])
    expect(readPilotPackIds()).toEqual(['heart-failure-cdss', 'atrial-fibrillation-cdss'])
    expect(JSON.parse(window.localStorage.getItem(PILOT_PACK_STORAGE_KEY) ?? 'null'))
      .toEqual(['heart-failure-cdss', 'atrial-fibrillation-cdss'])
  })

  it('trims whitespace and drops empty entries', () => {
    expect(applyPilotPackIdsFromUrl('?pilotPacks= heart-failure-cdss , ,heart-failure-cdss'))
      .toEqual(['heart-failure-cdss'])
  })

  it('survives a reload: a later visit without the parameter keeps the stored ids', () => {
    applyPilotPackIdsFromUrl('?pilotPacks=heart-failure-cdss')

    expect(applyPilotPackIdsFromUrl('')).toEqual(['heart-failure-cdss'])
    expect(applyPilotPackIdsFromUrl('?patient=123')).toEqual(['heart-failure-cdss'])
    expect(isPilotPack('heart-failure-cdss')).toBe(true)
  })

  it('clears the pilot packs on an empty parameter', () => {
    applyPilotPackIdsFromUrl('?pilotPacks=heart-failure-cdss')

    expect(applyPilotPackIdsFromUrl('?pilotPacks=')).toEqual([])
    expect(readPilotPackIds()).toEqual([])
    expect(window.localStorage.getItem(PILOT_PACK_STORAGE_KEY)).toBeNull()
    expect(isPilotPack('heart-failure-cdss')).toBe(false)
  })

  it('treats a corrupt stored entry as no pilot packs instead of throwing', () => {
    window.localStorage.setItem(PILOT_PACK_STORAGE_KEY, 'not json')

    expect(readPilotPackIds()).toEqual([])
    expect(isPilotPack('heart-failure-cdss')).toBe(false)
  })

  it('writes ids directly for the settings switch', () => {
    writePilotPackIds(['heart-failure-cdss'])
    expect(isPilotPack('heart-failure-cdss')).toBe(true)

    writePilotPackIds([])
    expect(readPilotPackIds()).toEqual([])
  })

  describe('on the Medcloud launch route', () => {
    it('ignores the URL parameter', () => {
      mockMedcloudLaunchRoute = true

      expect(applyPilotPackIdsFromUrl('?pilotPacks=heart-failure-cdss')).toEqual([])
      expect(window.localStorage.getItem(PILOT_PACK_STORAGE_KEY)).toBeNull()
    })

    it('does not honour pilot packs an earlier visit left in this browser', () => {
      writePilotPackIds(['heart-failure-cdss'])
      mockMedcloudLaunchRoute = true

      expect(isPilotPack('heart-failure-cdss')).toBe(false)
      // Storage is untouched, so the tester keeps the pack outside this route.
      expect(readPilotPackIds()).toEqual(['heart-failure-cdss'])
    })
  })
})
