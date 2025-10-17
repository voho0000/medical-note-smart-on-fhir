"use client"
import { useEffect, useState } from "react"
export type FhirPatient = any
export function useSmartPatient() {
  const [patient, setPatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const FHIR = (await import("fhirclient")).default
        const client = await FHIR.oauth2.ready()
        const res = await client.request("Patient")
        const p =
          res?.resourceType === "Bundle"
            ? res.entry?.find((e: any) => e.resource?.resourceType === "Patient")?.resource
            : res
        if (mounted) setPatient(p ?? null)
      } catch (e) {
        if (mounted) { setPatient(null); setError(e) }
        console.error("Load Patient failed:", e)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  return { patient, loading, error }
}
