// Custom Hook: Patient Info Processing
import { useMemo } from 'react'
import type { PatientInfo } from '../types'
import {
  calculateAge,
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
  const { locale, t } = useLanguage()
  return useMemo<PatientInfo | null>(() => {
    if (!patient) return null
    const rawName = formatName(patient, locale)
    const missingName = ['n/a', 'unknown', 'unknown patient'].includes(
      rawName.trim().toLowerCase(),
    )
    const gender = patient.gender === 'male'
      ? t.patient.male
      : patient.gender === 'female'
        ? t.patient.female
        : patient.gender === 'other'
          ? t.patient.other
          : t.patient.unknown

    return {
      name: missingName ? t.patient.unknown : rawName,
      gender,
      age: calculateAge(patient.birthDate),
      id: patient.id,
      identifiers: formatIdentifiers(patient, t.patient),
      birthDate: patient.birthDate,
      telecom: formatTelecom(patient, t.patient),
      addresses: formatAddresses(patient),
      maritalStatus: formatMaritalStatus(patient, t.patient),
      languages: formatLanguages(patient, t.patient),
      contacts: formatContacts(patient, t.patient),
      userEnteredFields: patient.userEnteredDemographicFields,
    }
  }, [locale, patient, t])
}
