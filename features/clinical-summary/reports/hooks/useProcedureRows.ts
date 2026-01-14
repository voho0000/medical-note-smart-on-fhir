// Custom Hook: Procedure Rows Processing
import { useMemo } from 'react'
import type { Observation, Row } from '../types'
import { getCodeableConceptText, getConceptText, formatDate } from '../utils/fhir-helpers'
import { useLanguage } from "@/src/application/providers/language.provider"

export function useProcedureRows(procedures: any[], observations: any[] = []) {
  const { t } = useLanguage()
  
  return useMemo(() => {
    if (!Array.isArray(procedures)) return []

    // Debug: log all observations and their categories
    console.log('[useProcedureRows] total observations received:', observations.length)
    observations.slice(0, 5).forEach((obs: any, i: number) => {
      console.log(`[useProcedureRows] obs[${i}] category:`, obs?.category, 'code:', obs?.code?.text || obs?.code?.coding?.[0]?.display)
    })
    
    // Filter observations with category "procedure"
    const procedureObservations = observations.filter((obs: any) => {
      if (!obs?.category) return false
      const categories = Array.isArray(obs.category) ? obs.category : [obs.category]
      return categories.some((cat: any) => {
        const coding = cat?.coding?.[0]
        const isProcedure = coding?.code?.toLowerCase() === 'procedure'
        if (isProcedure) {
          console.log('[useProcedureRows] Found procedure observation:', obs?.code?.text || obs?.code?.coding?.[0]?.display, 'encounter:', obs?.encounter?.reference)
        }
        return isProcedure
      })
    })
    
    console.log('[useProcedureRows] procedureObservations:', procedureObservations.length, procedureObservations)
    console.log('[useProcedureRows] procedures:', procedures.length, procedures)

    return procedures.map((procedure: any) => {
      const title = getCodeableConceptText(procedure?.code) || "Procedure"
      const performed = procedure?.performedDateTime || procedure?.performedPeriod?.start
      // Extract performer with better fallback logic
      let performer: string | undefined
      if (Array.isArray(procedure?.performer) && procedure.performer.length > 0) {
        performer = procedure.performer
          .map((p: any) => {
            // Try different FHIR formats
            return p?.actor?.display || 
                   p?.display || 
                   p?.actor?.reference?.split('/').pop() ||
                   p?.reference?.split('/').pop()
          })
          .filter(Boolean)
          .join(", ")
        
        // Debug: log if we have performer array but no extracted names
        if (!performer && procedure.performer.length > 0) {
          console.log('[Procedure] performer data structure:', procedure.performer[0])
        }
      }
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
      components.push({ code: { text: t.procedures.status }, valueString: procedure?.status || "—" })
      if (performed) {
        components.push({ code: { text: t.procedures.performedDate }, valueString: formatDate(performed) })
      }
      if (performer) {
        components.push({ code: { text: t.procedures.performer }, valueString: performer })
      }
      if (category && category !== "—") {
        components.push({ code: { text: t.procedures.category }, valueString: category })
      }
      if (reason && reason !== "—") {
        components.push({ code: { text: t.procedures.reason }, valueString: reason })
      }
      if (outcome && outcome !== "—") {
        components.push({ code: { text: t.procedures.outcome }, valueString: outcome })
      }
      if (location) {
        components.push({ code: { text: t.procedures.location }, valueString: location })
      }
      if (bodySite && bodySite !== "—") {
        components.push({ code: { text: t.procedures.bodySite }, valueString: bodySite })
      }
      if (followUp && followUp !== "—") {
        components.push({ code: { text: t.procedures.followUp }, valueString: followUp })
      }
      if (reports.length > 0) {
        components.push({ code: { text: t.procedures.reports }, valueString: reports.join(", ") })
      }
      if (notes) {
        components.push({ code: { text: t.procedures.notes }, valueString: notes })
      }

      const observation: Observation = {
        resourceType: "Observation",
        id: procedure?.id ? `procedure-${procedure.id}` : `procedure-${Math.random().toString(36).slice(2, 10)}`,
        code: { text: title },
        valueString: outcome !== "—" ? outcome : notes || "—",
        effectiveDateTime: performed,
        status: procedure?.status,
        category: procedure?.category,
        component: components,
      }

      // Find related observations with category "procedure" that share the same encounter
      const procEncounter = procedure?.encounter?.reference
      console.log('[useProcedureRows] procedure encounter:', procEncounter, 'title:', title)
      
      const relatedObservations = procedureObservations.filter((obs: any) => {
        const obsEncounter = obs?.encounter?.reference
        console.log('[useProcedureRows] comparing obs encounter:', obsEncounter, 'with proc encounter:', procEncounter)
        return obsEncounter && procEncounter && obsEncounter === procEncounter
      })
      
      console.log('[useProcedureRows] relatedObservations for', title, ':', relatedObservations.length, relatedObservations)

      return {
        id: procedure?.id || `procedure-row-${Math.random().toString(36).slice(2, 10)}`,
        title,
        meta: `Procedure • ${procedure?.status || "—"} • ${formatDate(performed)}`,
        obs: [observation, ...relatedObservations],
        group: "procedures" as const
      }
    })
  }, [procedures, observations, t])
}
