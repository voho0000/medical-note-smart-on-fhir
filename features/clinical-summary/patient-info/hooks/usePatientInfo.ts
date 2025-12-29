// Custom Hook: Patient Info Processing
import { useMemo } from 'react'
import type { PatientInfo } from '../types'
import { calculateAge, formatGender, formatName } from '../utils/patient-helpers'

export function usePatientInfo(patient: any) {
  return useMemo<PatientInfo | null>(() => {
    if (!patient) return null
    
    return {
      name: formatName(patient),
      gender: formatGender(patient.gender),
      age: calculateAge(patient.birthDate),
      id: patient.id
    }
  }, [patient])
}
