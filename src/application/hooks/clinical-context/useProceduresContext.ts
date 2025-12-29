// Procedures Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import { mapAndFilter } from "./formatters"
import type { ClinicalData } from "./types"

export function useProceduresContext(
  includeProcedures: boolean,
  clinicalData: ClinicalData | null
): ClinicalContextSection | null {
  return useMemo(() => {
    if (!includeProcedures || !clinicalData?.procedures?.length) return null

    const items = mapAndFilter(clinicalData.procedures, (procedure) => {
      const name = procedure.code?.text || procedure.code?.coding?.[0]?.display || "Procedure"
      const performed = procedure.performedDateTime || procedure.performedPeriod?.end || procedure.performedPeriod?.start
      const datePart = performed ? ` (${new Date(performed).toLocaleDateString()})` : ""
      const status = procedure.status ? ` – ${procedure.status}` : ""
      return `${name}${datePart}${status}`.trim()
    })

    if (items.length === 0) return null

    return { title: "Procedures", items }
  }, [includeProcedures, clinicalData])
}
