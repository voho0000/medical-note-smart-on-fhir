// Refactored PatientInfoCard Component
"use client"

import { usePatient } from "@/src/application/hooks/patient/use-patient-query.hook"
import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { usePatientInfo } from './hooks/usePatientInfo'
import { PatientInfoDisplay } from './components/PatientInfoDisplay'

export function PatientInfoCard() {
  const { t } = useLanguage()
  const { patient, loading, error } = usePatient()
  const patientInfo = usePatientInfo(patient)

  const errorObj = error ? new Error(String(error)) : null

  return (
    <FeatureCard 
      title={t.patient.info}
      isLoading={loading} 
      error={errorObj}
      isEmpty={!patientInfo}
      emptyMessage={t.errors.fetchPatient}
    >
      {patientInfo && <PatientInfoDisplay patientInfo={patientInfo} />}
    </FeatureCard>
  )
}
