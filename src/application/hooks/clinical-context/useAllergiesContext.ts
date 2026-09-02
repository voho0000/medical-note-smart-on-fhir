// Allergies Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickLocalizedText } from "@/src/shared/utils/fhir-display-helpers"

export function useAllergiesContext(
  includeAllergies: boolean,
  clinicalData: ClinicalData | null
): ClinicalContextSection | null {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  return useMemo(() => {
    if (!includeAllergies || !clinicalData?.allergies?.length) return null

    const conceptText = (concept: any): string | undefined =>
      pickLocalizedText(concept, audience, locale)
      || concept?.text
      || concept?.coding?.[0]?.display
      || concept?.coding?.[0]?.code

    const items = clinicalData.allergies.map((allergy: any) => {
      const name = conceptText(allergy.code) || 'Unknown allergy'
      const meta = [
        allergy.criticality ? `criticality=${allergy.criticality}` : null,
        allergy.type ? `type=${allergy.type}` : null,
        allergy.category?.length ? `category=${allergy.category.join(',')}` : null,
      ].filter(Boolean).join('; ')
      const reactions = (allergy.reaction ?? []).flatMap((reaction: any) => {
        const manifestations = (reaction.manifestation ?? []).map(conceptText).filter(Boolean)
        const description = reaction.description || manifestations.join(', ')
        if (!description) return []
        const reactionMeta = [
          reaction.severity ? `severity=${reaction.severity}` : null,
          reaction.onset ? `onset=${reaction.onset}` : null,
        ].filter(Boolean).join('; ')
        return [`reaction: ${description}${reactionMeta ? ` (${reactionMeta})` : ''}`]
      })
      return `${name}${meta ? ` [${meta}]` : ''}${reactions.length ? `; ${reactions.join('; ')}` : ''}`
    })

    if (items.length === 0) return null

    return { title: "Patient's Allergies", items }
  }, [includeAllergies, clinicalData, audience, locale])
}
