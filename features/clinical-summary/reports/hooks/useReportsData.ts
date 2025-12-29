// Custom Hook: Reports Data Processing
import { useMemo } from 'react'
import type { DiagnosticReport, Observation, Row } from '../types'
import { getCodeableConceptText, getConceptText, formatDate } from '../utils/fhir-helpers'
import { inferGroupFromCategory } from '../utils/grouping-helpers'

export function useReportsData(diagnosticReports: any[]) {
  return useMemo(() => {
    const rows: Row[] = []
    const seen = new Set() as Set<string>

    (diagnosticReports as DiagnosticReport[]).forEach((dr: DiagnosticReport) => {
      if (!dr) return

      const obs = Array.isArray(dr._observations)
        ? dr._observations.filter((o: any): o is Observation => !!o)
        : []

      obs.forEach((o: Observation) => {
        if (o?.id) seen.add(o.id)
      })

      if (obs.length === 0 && !dr.conclusion && !dr.note?.length) return

      const category = Array.isArray(dr.category)
        ? dr.category.map((c: any) => getCodeableConceptText(c)).filter(Boolean).join(', ')
        : getCodeableConceptText(dr.category)

      const summaryParts: string[] = []
      const conclusionText = dr.conclusion?.trim()
      const conclusionCodes = getConceptText(dr.conclusionCode)
      const notes = Array.isArray(dr.note)
        ? dr.note.map((n: any) => n?.text).filter(Boolean)
        : []
      if (conclusionText) summaryParts.push(`Conclusion: ${conclusionText}`)
      if (conclusionCodes && conclusionCodes !== "—") summaryParts.push(`Conclusion Codes: ${conclusionCodes}`)
      if (notes.length > 0) summaryParts.push(notes.join("\n"))

      const attachments = Array.isArray(dr.presentedForm)
        ? dr.presentedForm
            .map((form: any) => form?.title || form?.contentType)
            .filter(Boolean)
        : []

      const summaryComponents: any[] = []
      if (attachments.length > 0) {
        summaryComponents.push({
          code: { text: "Attachments" },
          valueString: attachments.join(", ")
        })
      }

      const obsWithSummary = [...obs]
      if (summaryParts.length > 0 || attachments.length > 0) {
        const summaryObservation: Observation = {
          resourceType: "Observation",
          id: dr.id ? `dr-summary-${dr.id}` : `dr-summary-${Math.random().toString(36).slice(2, 10)}`,
          code: { text: "Report Summary" },
          valueString: summaryParts.join("\n\n") || "Supporting documents available",
          effectiveDateTime: dr.effectiveDateTime || dr.issued,
          status: dr.status,
          component: summaryComponents,
        }
        obsWithSummary.unshift(summaryObservation)
      }

      rows.push({
        id: dr.id || Math.random().toString(36),
        title: getCodeableConceptText(dr.code) || "Unnamed Report",
        meta: `${category || "Laboratory"} • ${dr.status || "—"} • ${formatDate(dr.issued || dr.effectiveDateTime)}`,
        obs: obsWithSummary,
        group: inferGroupFromCategory(dr.category)
      })
    })

    return { reportRows: rows, seenIds: seen }
  }, [diagnosticReports])
}
