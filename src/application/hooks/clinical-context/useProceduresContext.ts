// Procedures Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickLocalizedText } from "@/src/shared/utils/fhir-display-helpers"
import { filterProcedureRecords, procedureDate } from "@/src/core/utils/clinical-context-selection.utils"

export function useProceduresContext(
  includeProcedures: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters,
  // Retained for API compatibility. The procedure section remains
  // authoritative even when visit-linked records are repeated chronologically.
  _encountersShown: boolean = false
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

    // Keep the standalone section authoritative. A procedure may be repeated
    // under its encounter for chronology; removing it here used to lose records
    // whenever the encounter and procedure time windows differed.
    const procedures = filterProcedureRecords(
      clinicalData.procedures,
      filters,
      clinicalData as { encounters?: any[] },
    )

    if (procedures.length === 0) {
      return { title: "Procedures", items: ["No procedures found within the selected time range."] }
    }

    // Format items
    const items = procedures.map((procedure) => {
      const name = procedureName(procedure)
      const performed = procedureDate(procedure)
      const datePart = performed ? ` (${new Date(performed).toLocaleDateString()})` : ""
      const statusCode = procedure.status || 'unknown'
      const semantics = statusCode === 'not-done'
        ? ' (NOT PERFORMED)'
        : statusCode === 'entered-in-error'
          ? ' (INVALIDATED—do not use as a clinical fact)'
          : ''
      const status = ` – status: ${statusCode}${semantics}`
      return `${name}${datePart}${status}`.trim()
    })

    if (items.length === 0) return null

    items.unshift('Record-fidelity note: visit-linked procedures may also appear under their visit; do not count repeated records as separate procedures.', '')

    return { title: "Procedures", items }
  }, [includeProcedures, clinicalData, filters, audience, locale])
}
