// features/data-selection/hooks/useClinicalContext.ts
"use client"

import { useDataSelection } from "@/features/data-selection/hooks/useDataSelection"
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"

export function useClinicalContext() {
  const { selectedData } = useDataSelection()
  const clinicalData = useClinicalData()

  const getClinicalContext = () => {
    let context = []

    if (selectedData.conditions && clinicalData.diagnoses?.length) {
      context.push({
        title: "Patient's Conditions",
        items: clinicalData.diagnoses
          .map(d => d.code?.text || 'Unknown diagnosis')
          .filter(Boolean)
      })
    }

    if (selectedData.medications && clinicalData.medications?.length) {
      context.push({
        title: "Patient's Medications",
        items: clinicalData.medications
          .map(m => m.medicationCodeableConcept?.text || 'Unknown medication')
          .filter(Boolean)
      })
    }

    if (selectedData.allergies && clinicalData.allergies?.length) {
      context.push({
        title: "Patient's Allergies",
        items: clinicalData.allergies
          .map(a => a.code?.text || 'Unknown allergy')
          .filter(Boolean)
      })
    }

    if (selectedData.diagnosticReports && clinicalData.diagnosticReports?.length) {
      context.push({
        title: "Diagnostic Reports",
        items: clinicalData.diagnosticReports
          .map(r => r.conclusion ? `${r.code?.text || 'Report'}: ${r.conclusion}` : null)
          .filter(Boolean) as string[]
      })
    }

    if (selectedData.observations && clinicalData.observations?.length) {
      context.push({
        title: "Observations",
        items: clinicalData.observations
          .map(o => {
            const value = o.valueQuantity?.value || o.valueString
            return value ? `${o.code?.text || 'Observation'}: ${value}` : null
          })
          .filter(Boolean) as string[]
      })
    }

    return context
  }

  const formatClinicalContext = (context: { title: string; items: string[] }[]) => {
    return context
      .filter(section => section.items.length > 0)
      .map(section => 
        `${section.title}:\n${section.items.map(item => `- ${item}`).join('\n')}`
      )
      .join('\n\n')
  }

  return {
    getClinicalContext,
    formatClinicalContext,
    getFormattedClinicalContext: () => formatClinicalContext(getClinicalContext())
  }
}
