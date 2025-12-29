// System Prompt Generation Hook
import { useMemo } from "react"
import { useClinicalContext } from "@/src/application/hooks/use-clinical-context.hook"
import { usePatient } from "@/src/application/providers/patient.provider"
import { useDataSelection } from "@/src/application/providers/data-selection.provider"

export function useSystemPrompt() {
  const { getFullClinicalContext } = useClinicalContext()
  const { patient: currentPatient } = usePatient()
  const { selectedData } = useDataSelection()

  const clinicalContext = useMemo(() => getFullClinicalContext(), [getFullClinicalContext])

  const systemPrompt = useMemo(() => {
    const nameEntry = currentPatient?.name?.[0]
    const given = nameEntry?.given?.join(" ")?.trim()
    const family = nameEntry?.family?.trim()
    const patientName = [given, family].filter(Boolean).join(" ") || "the patient"
    
    const patientDetails = selectedData.patientInfo
      ? clinicalContext
      : clinicalContext.replace(/Patient Information:[\s\S]*?(?=\n\n|$)/, "").trim()

    return [
      "You are a helpful medical assistant helping clinicians compose medical notes.",
      "Be concise, evidence-based, and note uncertainties when appropriate.",
      "If the conversation includes updated clinical context, reference it directly instead of prior context.",
      "Patient Context:",
      patientDetails || "No clinical context available.",
      `Patient Name: ${patientName}`,
    ].join("\n")
  }, [clinicalContext, currentPatient?.name, selectedData.patientInfo])

  return { systemPrompt, clinicalContext }
}
