"use client"

import { useEffect, useState } from "react"

// 你可以擴充這個型別；先放常用欄位
export type Patient = {
  id?: string
  resourceType?: "Patient"
  name?: { given?: string[]; family?: string }[]
  gender?: string
  birthDate?: string
} | null

export function useSmartPatient() {
  const [patient, setPatient] = useState<Patient>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        // 動態載入 fhirclient，避免 SSR/靜態輸出問題
        const FHIR = (await import("fhirclient")).default
        const client = await FHIR.oauth2.ready()

        // 有些伺服器回 Bundle，有些直接回單一 Patient
        const res: any = await client.request("Patient")
        const p =
          res?.resourceType === "Bundle"
            ? res.entry?.find((e: any) => e.resource?.resourceType === "Patient")?.resource
            : res

        if (mounted) setPatient(p ?? null)
      } catch (e: any) {
        console.error("Load Patient failed:", e)
        if (mounted) {
          setPatient(null)
          setError(e?.message ?? "Failed to load patient")
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  return { patient, loading, error }
}
