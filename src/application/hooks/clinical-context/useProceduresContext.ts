// Procedures Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import { makeTimeRangeTest } from "@/src/core/utils/date-filter.utils"
import type { ClinicalData } from "./types"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickLocalizedText } from "@/src/shared/utils/fhir-display-helpers"
import { partitionByEncounterLink } from "@/src/core/utils/encounter-link.utils"

export function useProceduresContext(
  includeProcedures: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters,
  // When 就診紀錄 is also shown, visit-linked procedures are already listed under
  // each visit there — so here we keep only orphan procedures (not tied to a
  // recorded visit) and flag the split with a note. Defaults false.
  encountersShown: boolean = false
): ClinicalContextSection | null {
  const { audience } = useAudience()
  const { locale } = useLanguage()
  return useMemo(() => {
    if (!includeProcedures || !clinicalData?.procedures?.length) return null

    const procedureName = (procedure: any): string =>
      pickLocalizedText(procedure.code, audience, locale)
      || procedure.code?.text
      || procedure.code?.coding?.[0]?.display
      || "Procedure"

    // Visit-linked procedures live under their visit (Visits & Treatment
    // History); here we keep only orphans when encounters is shown.
    let source = clinicalData.procedures
    const encounters = (clinicalData as unknown as { encounters?: { id?: string }[] }).encounters
    const onlyOrphans = encountersShown && (encounters?.length ?? 0) > 0
    if (onlyOrphans) {
      source = partitionByEncounterLink(source, encounters).orphan
      if (source.length === 0) return null
    }

    // Filter by time range
    const inWindow = makeTimeRangeTest(
      filters?.procedureTimeRange ?? 'all',
      clinicalData as { encounters?: any[] } | null,
    )
    let procedures = source.filter((procedure) => {
      const performed = procedure.performedDateTime || procedure.performedPeriod?.end || procedure.performedPeriod?.start
      return inWindow(performed)
    })

    if (procedures.length === 0) {
      // When showing only orphans, an empty result means everything is visit-
      // linked (already listed above) — emit nothing rather than a misleading
      // "no procedures" line.
      if (onlyOrphans) return null
      return { title: "Procedures", items: ["No procedures found within the selected time range."] }
    }

    // Group by procedure name for version filtering
    if (filters?.procedureVersion === 'latest') {
      const byName = new Map<string, typeof procedures[0]>()
      procedures.forEach(procedure => {
        const name = procedureName(procedure)
        const existing = byName.get(name)
        const performed = procedure.performedDateTime || procedure.performedPeriod?.end || procedure.performedPeriod?.start
        const existingPerformed = existing?.performedDateTime || existing?.performedPeriod?.end || existing?.performedPeriod?.start

        if (!existing || (performed && existingPerformed && performed > existingPerformed)) {
          byName.set(name, procedure)
        }
      })
      procedures = Array.from(byName.values())
    }

    // Format items
    const items = procedures.map((procedure) => {
      const name = procedureName(procedure)
      const performed = procedure.performedDateTime || procedure.performedPeriod?.end || procedure.performedPeriod?.start
      const datePart = performed ? ` (${new Date(performed).toLocaleDateString()})` : ""
      const status = procedure.status ? ` – ${procedure.status}` : ""
      return `${name}${datePart}${status}`.trim()
    })

    if (items.length === 0) return null

    if (onlyOrphans) {
      items.unshift(
        "Note: procedures performed during a visit are listed under that visit in 'Visits & Treatment History' above and are NOT repeated here. The procedures below are not linked to any visit.",
        '',
      )
    }

    return { title: "Procedures", items }
  }, [includeProcedures, clinicalData, filters, audience, locale, encountersShown])
}
