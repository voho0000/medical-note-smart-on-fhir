// DTO: Clinical Context
import type { ClinicalContextSection } from '@/src/core/entities/clinical-context.entity'

export interface ClinicalContextDTO {
  sections: ClinicalContextSection[]
  formattedText: string
  supplementaryNotes?: string
}

export function createClinicalContextDTO(
  sections: ClinicalContextSection[],
  formattedText: string,
  supplementaryNotes?: string
): ClinicalContextDTO {
  return {
    sections,
    formattedText,
    supplementaryNotes
  }
}
