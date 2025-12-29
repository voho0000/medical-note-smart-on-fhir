// Custom Hook: Procedure Rows Processing
import { useMemo } from 'react'
import type { Observation, Row } from '../types'
import { getCodeableConceptText, getConceptText, formatDate } from '../utils/fhir-helpers'

export function useProcedureRows(procedures: any[]) {
  return useMemo(() => {
    if (!Array.isArray(procedures)) return []

    return procedures.map((procedure: any) => {
      const title = getCodeableConceptText(procedure?.code) || "Procedure"
      const performed = procedure?.performedDateTime || procedure?.performedPeriod?.start
      const performer = Array.isArray(procedure?.performer)
        ? procedure.performer
            .map((p: any) => p?.actor?.display || p?.actor?.reference)
            .filter(Boolean)
            .join(", ")
        : undefined
      const outcome = getConceptText(procedure?.outcome)
      const category = getConceptText(procedure?.category)
      const location = procedure?.location?.display
      const reason = getConceptText(procedure?.reasonCode)
      const bodySite = getConceptText(procedure?.bodySite)
      const followUp = getConceptText(procedure?.followUp)
      const notes = Array.isArray(procedure?.note)
        ? procedure.note.map((n: any) => n?.text).filter(Boolean).join("\n")
        : undefined
      const reports = Array.isArray(procedure?.report)
        ? procedure.report.map((ref: any) => ref?.display || ref?.reference).filter(Boolean)
        : []

      const components: any[] = []
      components.push({ code: { text: "Status" }, valueString: procedure?.status || "—" })
      if (performed) {
        components.push({ code: { text: "Performed On" }, valueString: formatDate(performed) })
      }
      if (performer) {
        components.push({ code: { text: "Performer" }, valueString: performer })
      }
      if (category && category !== "—") {
        components.push({ code: { text: "Category" }, valueString: category })
      }
      if (reason && reason !== "—") {
        components.push({ code: { text: "Reason" }, valueString: reason })
      }
      if (outcome && outcome !== "—") {
        components.push({ code: { text: "Outcome" }, valueString: outcome })
      }
      if (location) {
        components.push({ code: { text: "Location" }, valueString: location })
      }
      if (bodySite && bodySite !== "—") {
        components.push({ code: { text: "Body Site" }, valueString: bodySite })
      }
      if (followUp && followUp !== "—") {
        components.push({ code: { text: "Follow Up" }, valueString: followUp })
      }
      if (reports.length > 0) {
        components.push({ code: { text: "Reports" }, valueString: reports.join(", ") })
      }
      if (notes) {
        components.push({ code: { text: "Notes" }, valueString: notes })
      }

      const observation: Observation = {
        resourceType: "Observation",
        id: procedure?.id ? `procedure-${procedure.id}` : `procedure-${Math.random().toString(36).slice(2, 10)}`,
        code: { text: "Procedure Summary" },
        valueString: outcome !== "—" ? outcome : notes || "Expand to view procedure details",
        effectiveDateTime: performed,
        status: procedure?.status,
        category: procedure?.category,
        component: components,
      }

      return {
        id: procedure?.id || `procedure-row-${Math.random().toString(36).slice(2, 10)}`,
        title,
        meta: `Procedure • ${procedure?.status || "—"} • ${formatDate(performed)}`,
        obs: [observation],
        group: "procedures" as const
      }
    })
  }, [procedures])
}
