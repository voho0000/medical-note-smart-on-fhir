"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SmartCallbackPage() {
  const router = useRouter()
  useEffect(() => {
    (async () => {
      const FHIR = (await import("fhirclient")).default
      try {
        await FHIR.oauth2.ready()   // ← 在這裡完成 code→token
        router.replace("/")         // ← 回你的主頁
      } catch (e) {
        console.error("SMART callback error", e)
      }
    })()
  }, [router])

  return <p className="p-6 text-sm text-muted-foreground">Completing SMART login…</p>
}
