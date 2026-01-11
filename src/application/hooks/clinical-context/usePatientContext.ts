// Patient Context Hook
import { useMemo } from "react"
import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { calculateAge } from "@/src/shared/utils/date.utils"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"

export function usePatientContext(includePatientInfo: boolean): ClinicalContextSection | null {
  const { patient: currentPatient } = usePatient()

  return useMemo(() => {
    if (!includePatientInfo || !currentPatient) return null

    const items: string[] = []
    const gender = currentPatient.gender 
      ? `${currentPatient.gender.charAt(0).toUpperCase()}${currentPatient.gender.slice(1)}` 
      : null
    
    if (gender) {
      items.push(`Gender: ${gender}`)
    }
    
    const age = calculateAge(currentPatient.birthDate)
    if (age !== "Unknown") {
      items.push(`Age: ${age}`)
    }
    
    if (items.length === 0) return null
    
    return { title: "Patient Information", items }
  }, [includePatientInfo, currentPatient])
}
