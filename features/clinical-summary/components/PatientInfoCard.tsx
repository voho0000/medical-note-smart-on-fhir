"use client"

import { usePatient } from "@/lib/providers/PatientProvider"

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
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-base font-semibold">Patient Info</div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading patient data…</div>
      ) : !patient ? (
        <div className="text-sm text-red-500">No patient found.</div>
      ) : (
        <div className="space-y-1 text-sm">
          <div>
            <span className="font-medium">Name:</span>{" "}
            {patient?.name?.[0]?.given?.join(" ") || "N/A"} {patient?.name?.[0]?.family || "N/A"}
          </div>
          <div>
            <span className="font-medium">Gender:</span> {patient?.gender || "N/A"}
          </div>
          <div>
            <span className="font-medium">Age:</span> {calculateAge(patient?.birthDate)}
          </div>
          {patient?.id && (
            <div className="text-xs text-muted-foreground">ID: {patient.id}</div>
          )}
        </div>
      )}
    </div>
  )
}
