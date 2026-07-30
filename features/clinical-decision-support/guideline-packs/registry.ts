import { DM_CKD_GUIDELINE_PACK } from './dm-ckd-pack'
import { CKD_GUIDELINE_PACK } from './ckd-pack'
import type { CdssPatientProfile, ClinicalGuidelinePack } from '../types'

const guidelinePacks: readonly ClinicalGuidelinePack[] = [
  DM_CKD_GUIDELINE_PACK,
  CKD_GUIDELINE_PACK,
]

export function getEnabledClinicalGuidelinePacks(): readonly ClinicalGuidelinePack[] {
  return guidelinePacks.filter((pack) => pack.enabled)
}

export function getClinicalGuidelinePack(id: string): ClinicalGuidelinePack | undefined {
  return guidelinePacks.find((pack) => pack.id === id && pack.enabled)
}

export function getApplicableClinicalGuidelinePacks(
  profile: CdssPatientProfile,
): readonly ClinicalGuidelinePack[] {
  return getEnabledClinicalGuidelinePacks().filter((pack) => pack.applies(profile))
}

export function getDefaultClinicalGuidelinePack(): ClinicalGuidelinePack {
  return DM_CKD_GUIDELINE_PACK
}
