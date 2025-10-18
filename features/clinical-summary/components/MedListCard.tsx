"use client"

import { useEffect, useState } from "react"
import { usePatient } from "@/lib/providers/PatientProvider"

type MedItem = {
  id?: string
  display?: string
  authoredOn?: string
  status?: string
  source?: "MedicationRequest" | "MedicationStatement"
}

export function MedListCard() {
  const { patient } = usePatient()
  const [items, setItems] = useState<MedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!patient?.id) return
      setLoading(true)
      setError(null)
      try {
        const FHIR = (await import("fhirclient")).default
        const client = await FHIR.oauth2.ready()

        const result: MedItem[] = []

        // Primary: MedicationRequest
        try {
          const mr = await client.request(`MedicationRequest?patient=${patient.id}&_count=50`)
          const entries = mr?.entry ?? []
          for (const e of entries) {
            const r = e.resource
            if (r?.resourceType === "MedicationRequest") {
              const medDisp =
                r.medicationCodeableConcept?.text ||
                r.medicationCodeableConcept?.coding?.[0]?.display ||
                r.medicationReference?.display
              result.push({
                id: r.id,
                display: medDisp || "Medication",
                authoredOn: r.authoredOn,
                status: r.status,
                source: "MedicationRequest",
              })
            }
          }
        } catch { /* ignore */ }

        // Fallback: MedicationStatement
        if (result.length === 0) {
          try {
            const ms = await client.request(`MedicationStatement?patient=${patient.id}&_count=50`)
            const entries = ms?.entry ?? []
            for (const e of entries) {
              const r = e.resource
              if (r?.resourceType === "MedicationStatement") {
                const medDisp =
                  r.medicationCodeableConcept?.text ||
                  r.medicationCodeableConcept?.coding?.[0]?.display ||
                  r.medicationReference?.display
                result.push({
                  id: r.id,
                  display: medDisp || "Medication",
                  authoredOn: r.effectiveDateTime,
                  status: r.status,
                  source: "MedicationStatement",
                })
              }
            }
          } catch { /* ignore */ }
        }

        if (mounted) setItems(result)
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to load medications")
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [patient?.id])

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-base font-semibold">Medications</div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading medications…</div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No medications.</div>
      ) : (
        <ul className="divide-y">
          {items.map((m) => (
            <li key={m.id || Math.random()} className="py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{m.display}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.source} {m.status ? `• ${m.status}` : ""}
                  </div>
                </div>
                {m.authoredOn && (
                  <div className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {new Date(m.authoredOn).toLocaleDateString()}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
