// features/clinical-summary/components/PatientInfoCard.tsx
"use client"

import { useMemo } from "react"
import { usePatient } from "@/lib/providers/PatientProvider"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

function calculateAge(birthDate?: string): string {
  if (!birthDate) return "N/A"
  try {
    const birth = new Date(birthDate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age.toString()
  } catch (error) {
    console.error("Error calculating age:", error)
    return "N/A"
  }
}

function formatGender(gender?: string): string {
  if (!gender) return "N/A"
  return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase()
}

function formatName(patient: any): string {
  if (!patient?.name?.[0]) return "N/A"
  const name = patient.name[0]
  const givenName = name.given?.join(" ").trim()
  const familyName = name.family?.trim() || ""
  return [givenName, familyName].filter(Boolean).join(" ") || "N/A"
}

export function PatientInfoCard() {
  const { patient, loading, error } = usePatient()

  const patientInfo = useMemo(() => {
    if (!patient) return null
    
    return {
      name: formatName(patient),
      gender: formatGender(patient.gender),
      age: calculateAge(patient.birthDate),
      id: patient.id
    }
  }, [patient])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Patient Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-5 w-3/4 animate-pulse bg-muted rounded" />
          <div className="h-5 w-1/2 animate-pulse bg-muted rounded" />
          <div className="h-5 w-1/3 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    )
  }

  if (error || !patientInfo) {
    let errorMessage = "Failed to load patient information"
    
    if (error) {
      if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        // Handle object with message property
        const err = error as { message?: unknown }
        if (typeof err.message === 'string') {
          errorMessage = err.message
        } else {
          errorMessage = JSON.stringify(error)
        }
      } else {
        errorMessage = String(error)
      }
    }
      
    return (
      <Card>
        <CardHeader>
          <CardTitle>Patient Info</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">
            {errorMessage}
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
        <div className="grid grid-cols-3 gap-2">
          <span className="font-medium text-muted-foreground">Name:</span>
          <span className="col-span-2">{patientInfo.name}</span>
          
          <span className="font-medium text-muted-foreground">Gender:</span>
          <span className="col-span-2">{patientInfo.gender}</span>
          
          <span className="font-medium text-muted-foreground">Age:</span>
          <span className="col-span-2">{patientInfo.age}</span>
          
          {patientInfo.id && (
            <>
              <span className="font-medium text-muted-foreground">ID:</span>
              <span className="col-span-2 text-sm text-muted-foreground">
                {patientInfo.id}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
