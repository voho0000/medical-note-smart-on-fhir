// Custom Hook: Patient Info Processing
import { useMemo } from 'react'
import type { PatientInfo } from '../types'
import {
  calculateAge,
  formatGender,
  formatName,
  formatIdentifiers,
  formatTelecom,
  formatAddresses,
  formatMaritalStatus,
  formatLanguages,
  formatContacts,
} from '../utils/patient-helpers'
import { useLanguage } from '@/src/application/providers/language.provider'

export function usePatientInfo(patient: any) {
  const { t } = useLanguage()
  return useMemo<PatientInfo | null>(() => {
    if (!patient) return null

    return {
      name: formatName(patient),
      gender: formatGender(patient.gender),
      age: calculateAge(patient.birthDate),
      id: patient.id,
      identifiers: formatIdentifiers(patient, t.patient),
      birthDate: patient.birthDate,
      telecom: formatTelecom(patient, t.patient),
      addresses: formatAddresses(patient),
      maritalStatus: formatMaritalStatus(patient, t.patient),
      languages: formatLanguages(patient, t.patient),
      contacts: formatContacts(patient, t.patient),
    }
  }, [patient, t])
}
