// features/clinical-summary/components/PatientInfoCard.tsx
"use client"

import { usePatient } from "@/lib/providers/PatientProvider"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

function calculateAge(birthDate?: string) {
  if (!birthDate) return "N/A"
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const md = today.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function PatientInfoCard() {
  const { patient, loading } = usePatient()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {loading ? (
          <div className="text-muted-foreground">Loading patient data…</div>
        ) : !patient ? (
          <div className="text-red-600">No patient found.</div>
        ) : (
          <>
            <div>
              <span className="font-medium">Name:</span>{" "}
              {patient?.name?.[0]?.given?.join(" ") || "N/A"}{" "}
              {patient?.name?.[0]?.family || "N/A"}
            </div>
            <div>
              <span className="font-medium">Gender:</span>{" "}
              {patient?.gender || "N/A"}
            </div>
            <div>
              <span className="font-medium">Age:</span>{" "}
              {calculateAge(patient?.birthDate)}
            </div>
            {patient?.id && (
              <div className="text-xs text-muted-foreground">ID: {patient.id}</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
