import { DM_CKD_GUIDELINE_PACK } from './dm-ckd-pack'
import { CKD_GUIDELINE_PACK } from './ckd-pack'
import { HYPERTENSION_GUIDELINE_PACK } from './hypertension-pack'
import { HYPERLIPIDEMIA_GUIDELINE_PACK } from './hyperlipidemia-pack'
import { AKI_GUIDELINE_PACK } from './aki-pack'
import { HEART_FAILURE_GUIDELINE_PACK } from './heart-failure-pack'
import { CIRRHOSIS_GUIDELINE_PACK } from './cirrhosis-pack'
import { RENAL_SAFETY_GUIDELINE_PACK } from './renal-safety-pack'
import { ATRIAL_FIBRILLATION_GUIDELINE_PACK } from './atrial-fibrillation-pack'
import { CKD_ANEMIA_GUIDELINE_PACK } from './ckd-anemia-pack'
import type { CdssPatientProfile, ClinicalGuidelinePack } from '../types'

const guidelinePacks: readonly ClinicalGuidelinePack[] = [
  DM_CKD_GUIDELINE_PACK,
  CKD_GUIDELINE_PACK,
  HYPERTENSION_GUIDELINE_PACK,
  HYPERLIPIDEMIA_GUIDELINE_PACK,
  HEART_FAILURE_GUIDELINE_PACK,
  CIRRHOSIS_GUIDELINE_PACK,
  AKI_GUIDELINE_PACK,
  RENAL_SAFETY_GUIDELINE_PACK,
  ATRIAL_FIBRILLATION_GUIDELINE_PACK,
  CKD_ANEMIA_GUIDELINE_PACK,
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
