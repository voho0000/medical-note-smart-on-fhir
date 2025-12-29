// Refactored PatientInfoCard Component
"use client"

import { usePatient } from "@/src/application/providers/patient.provider"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { usePatientInfo } from './hooks/usePatientInfo'
import { PatientInfoDisplay } from './components/PatientInfoDisplay'
import { LoadingSkeleton } from './components/LoadingSkeleton'
import { formatError } from './utils/patient-helpers'

export function PatientInfoCard() {
  const { patient, loading, error } = usePatient()
  const patientInfo = usePatientInfo(patient)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Patient Info</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    )
  }

  if (error || !patientInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Patient Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">
            {error ? formatError(error) : "Failed to load patient information"}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <PatientInfoDisplay patientInfo={patientInfo} />
      </CardContent>
    </Card>
  )
}
