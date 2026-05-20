// Immunizations Context Hook — preventive vaccines (FHIR Immunization).
// Audience-aware: 民眾模式用中文 vaccineCode.text, 醫療人員 / 英文 UI 用英文 display.
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import { isWithinTimeRange } from "@/src/shared/utils/date.utils"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickLocalizedText } from "@/features/clinical-summary/medications/utils/fhir-helpers"

function vaccineKey(imm: any): string {
  return (
    imm?.vaccineCode?.coding?.[0]?.code ||
    imm?.vaccineCode?.text ||
    imm?.vaccineCode?.coding?.[0]?.display ||
    ''
  )
}

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

    const byKey = new Map<string, { name: string; latest?: string; count: number }>()
    for (const imm of filtered as any[]) {
      const key = vaccineKey(imm)
      if (!key) continue
      const name =
        pickLocalizedText(imm.vaccineCode, audience, locale) ||
        imm.vaccineCode?.text ||
        imm.vaccineCode?.coding?.[0]?.display ||
        'Unknown Vaccine'
      const date = imm.occurrenceDateTime
      const existing = byKey.get(key)
      if (existing) {
        existing.count += 1
        if (date && (!existing.latest || date > existing.latest)) {
          existing.latest = date
        }
      } else {
        byKey.set(key, { name, latest: date, count: 1 })
      }
    }

    if (byKey.size === 0) return null

    const items = Array.from(byKey.values())
      .sort((a, b) => (b.latest || '').localeCompare(a.latest || ''))
      .map((v) => {
        const datePart = v.latest
          ? ` (last dose: ${new Date(v.latest).toLocaleDateString()})`
          : ''
        const dosesPart = v.count > 1 ? `, ${v.count} doses` : ''
        return `${v.name}${datePart}${dosesPart}`
      })

    return { title: 'Immunizations', items }
  }, [includeImmunizations, clinicalData, filters, audience, locale])
}
