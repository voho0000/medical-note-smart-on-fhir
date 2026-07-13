// Immunizations Context Hook — preventive vaccines (FHIR Immunization).
// Audience-aware: 民眾模式用中文 vaccineCode.text, 醫療人員 / 英文 UI 用英文 display.
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import { isWithinTimeRange } from "@/src/shared/utils/date.utils"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickLocalizedText } from "@/src/shared/utils/fhir-display-helpers"

export function useImmunizationsContext(
  includeImmunizations: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters,
): ClinicalContextSection | null {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  return useMemo(() => {
    const data = clinicalData?.immunizations
    if (!includeImmunizations || !Array.isArray(data) || data.length === 0) return null

    const timeRange = (filters?.immunizationTimeRange as any) || 'all'
    const filtered = timeRange === 'all'
      ? data
      : data.filter((imm: any) => isWithinTimeRange(imm.occurrenceDateTime, timeRange))

    if (filtered.length === 0) return null

    const items = [...filtered as any[]]
      .sort((a, b) => (b.occurrenceDateTime || '').localeCompare(a.occurrenceDateTime || ''))
      .map((imm) => {
      const name =
        pickLocalizedText(imm.vaccineCode, audience, locale) ||
        imm.vaccineCode?.text ||
        imm.vaccineCode?.coding?.[0]?.display ||
        'Unknown Vaccine'
        const datePart = imm.occurrenceDateTime
          ? ` (${new Date(imm.occurrenceDateTime).toLocaleDateString()})`
          : ''
        const status = imm.status || 'unknown'
        const invalid = status === 'entered-in-error' ? '; INVALIDATED—do not treat as administered' : ''
        const meta = [
          `status=${status}${invalid}`,
          imm.lotNumber ? `lot=${imm.lotNumber}` : null,
          imm.manufacturer?.display ? `manufacturer=${imm.manufacturer.display}` : null,
          imm.performer?.[0]?.actor?.display ? `performer=${imm.performer[0].actor.display}` : null,
        ].filter(Boolean).join('; ')
        return `${name}${datePart} [${meta}]`
      })

    if (items.length === 0) return null
    return { title: 'Immunizations', items }
  }, [includeImmunizations, clinicalData, filters, audience, locale])
}
