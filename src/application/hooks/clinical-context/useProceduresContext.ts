// Procedures Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import { isWithinTimeRange } from "@/src/shared/utils/date.utils"
import type { ClinicalData } from "./types"

export function useProceduresContext(
  includeProcedures: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters
): ClinicalContextSection | null {
  return useMemo(() => {
    if (!includeProcedures || !clinicalData?.procedures?.length) return null

    // Filter by time range
    let procedures = clinicalData.procedures.filter((procedure) => {
      const performed = procedure.performedDateTime || procedure.performedPeriod?.end || procedure.performedPeriod?.start
      return isWithinTimeRange(performed, filters?.procedureTimeRange ?? 'all')
    })

    if (procedures.length === 0) {
      return { title: "Procedures", items: ["No procedures found within the selected time range."] }
    }

    // Group by procedure name for version filtering
    if (filters?.procedureVersion === 'latest') {
      const byName = new Map<string, typeof procedures[0]>()
      procedures.forEach(procedure => {
        const name = procedure.code?.text || procedure.code?.coding?.[0]?.display || "Procedure"
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
      const name = procedure.code?.text || procedure.code?.coding?.[0]?.display || "Procedure"
      const performed = procedure.performedDateTime || procedure.performedPeriod?.end || procedure.performedPeriod?.start
      const datePart = performed ? ` (${new Date(performed).toLocaleDateString()})` : ""
      const status = procedure.status ? ` – ${procedure.status}` : ""
      return `${name}${datePart}${status}`.trim()
    })

    if (items.length === 0) return null

    return { title: "Procedures", items }
  }, [includeProcedures, clinicalData, filters])
}
