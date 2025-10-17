// components/PatientInfoCard.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type FhirPatient = {
  name?: { given?: string[]; family?: string; text?: string }[]
  gender?: string
  birthDate?: string
}

function calculateAge(birthDate?: string) {
  if (!birthDate) return "N/A"
  const d = new Date(birthDate)
  if (Number.isNaN(d.getTime())) return "N/A"
  const t = new Date()
  let a = t.getFullYear() - d.getFullYear()
  const m = t.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--
  return a
}
function formatName(p?: FhirPatient) {
  const n = p?.name?.[0]; if (!n) return "N/A"
  if (n.text) return n.text
  const given = (n.given || []).join(" "); const family = n.family || ""
  return [given, family].filter(Boolean).join(" ") || "N/A"
}

export function PatientInfoCard({ patient }: { patient?: FhirPatient | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>Patient Info</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {patient ? (
          <>
            <div><span className="font-medium">Name:</span> {formatName(patient)}</div>
            <div><span className="font-medium">Gender:</span> {patient.gender ?? "N/A"}</div>
            <div><span className="font-medium">Age:</span> {calculateAge(patient.birthDate)}</div>
          </>
        ) : (
          <div>Loading patient data…</div>
        )}
      </CardContent>
    </Card>
  )
}
