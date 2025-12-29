// Refactored PatientInfoCard Component
"use client"

import { usePatient } from "@/src/application/providers/patient.provider"
import { FeatureCard } from "@/src/shared/components"
import { usePatientInfo } from './hooks/usePatientInfo'
import { PatientInfoDisplay } from './components/PatientInfoDisplay'

export function PatientInfoCard() {
  const { patient, loading, error } = usePatient()
  const patientInfo = usePatientInfo(patient)

  const errorObj = error ? new Error(String(error)) : null

  return (
    <FeatureCard 
      title="Patient Info" 
      isLoading={loading} 
      error={errorObj}
      isEmpty={!patientInfo}
      emptyMessage="Failed to load patient information"
    >
      {patientInfo && <PatientInfoDisplay patientInfo={patientInfo} />}
    </FeatureCard>
  )
}
