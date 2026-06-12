// Allergies Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import { mapAndFilter } from "./formatters"
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

    const items = mapAndFilter(
      clinicalData.allergies,
      (a) =>
        pickLocalizedText(a.code, audience, locale) ||
        a.code?.text ||
        "Unknown allergy"
    )

    if (items.length === 0) return null

    return { title: "Patient's Allergies", items }
  }, [includeAllergies, clinicalData, audience, locale])
}
