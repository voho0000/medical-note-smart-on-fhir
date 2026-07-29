import { DM_CKD_GUIDELINE_PACK } from './dm-ckd-pack'
import type { ClinicalGuidelinePack } from '../types'

const guidelinePacks: readonly ClinicalGuidelinePack[] = [
  DM_CKD_GUIDELINE_PACK,
]

export function getEnabledClinicalGuidelinePacks(): readonly ClinicalGuidelinePack[] {
  return guidelinePacks.filter((pack) => pack.enabled)
}

export function getClinicalGuidelinePack(id: string): ClinicalGuidelinePack | undefined {
  return guidelinePacks.find((pack) => pack.id === id && pack.enabled)
}

export function getDefaultClinicalGuidelinePack(): ClinicalGuidelinePack {
  return DM_CKD_GUIDELINE_PACK
}
