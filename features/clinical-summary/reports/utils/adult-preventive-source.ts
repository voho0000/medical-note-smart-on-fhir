import { referenceId } from '@/src/core/utils/observation-selectors'
import { isAdultPreventiveHealthExamResource } from '@/src/shared/utils/observation-provenance.utils'
import { isPreventiveMedicineComposition } from '@/features/clinical-summary/document-summary/utils/loinc-document-types'

type CompositionSectionLike = {
  entry?: Array<{ reference?: string }>
  section?: CompositionSectionLike[]
}

export function collectAdultPreventiveObservationIds(compositions: any[]): Set<string> {
  const ids = new Set<string>()

  const visitSection = (section: CompositionSectionLike) => {
    for (const entry of section.entry ?? []) {
      const id = referenceId(entry.reference)
      if (id) ids.add(id)
    }
    for (const child of section.section ?? []) visitSection(child)
  }

  for (const composition of compositions) {
    if (!isPreventiveMedicineComposition(composition)
      && !isAdultPreventiveHealthExamResource(composition)) continue
    for (const section of composition.section ?? []) visitSection(section)
  }

  return ids
}

