import { DM_EDUCATION_PACK } from './dm'
import type { DiseaseEducationPack } from '../types'

const DISEASE_PACKS: DiseaseEducationPack[] = [
  DM_EDUCATION_PACK,
]

export function getEnabledDiseasePacks(): DiseaseEducationPack[] {
  return [...DISEASE_PACKS]
}
