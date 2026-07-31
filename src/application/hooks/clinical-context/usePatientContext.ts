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
      items.push(
        currentPatient.birthDate && currentPatient.birthDate.length < 10
          ? `Approximate age (from birth year): ${age.replace(/^~/, '')}`
          : `Age: ${age}`,
      )
    }

    if (currentPatient.demographicsSource === 'user-entered-local-profile') {
      items.push('Demographics source: User-entered in the App (not supplied by the source record)')
    }
    
    if (items.length === 0) return null
    
    return { title: "Patient Information", items }
  }, [includePatientInfo, currentPatient])
}
