"use client"
// SMART OAuth callback. On failure this used to log to console and sit on
// "Completing SMART login…" forever (audit D1) — now it renders an error
// state with a way back. Bilingual hardcoded strings: this page lives outside
// the app's provider tree, so the i18n hook isn't available.
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

function basePrefix(): string {
  const repoBase = "/medical-note-smart-on-fhir"
  return typeof window !== "undefined" && window.location.pathname.startsWith(`${repoBase}/`)
    ? repoBase
    : ""
}

export default function SmartCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const FHIR = (await import("fhirclient")).default
      try {
        await FHIR.oauth2.ready()   // ← 在這裡完成 code→token
        router.replace("/")         // ← 回你的主頁
      } catch (e) {
        console.error("SMART callback error", e)
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [router])

  if (error) {
    const prefix = basePrefix()
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-lg font-semibold text-destructive">
          SMART 登入失敗 <span className="font-normal text-muted-foreground">/ SMART sign-in failed</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          授權流程未能完成（授權逾時、被拒絕，或啟動連結已失效）。請從院內系統（EHR）重新啟動本應用程式。
        </p>
        <p className="text-xs text-muted-foreground/80 break-all rounded bg-muted p-2 font-mono">{error}</p>
        <div className="flex gap-3">
          <a
            href={`${prefix}/`}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            回首頁 / Home
          </a>
          <a
            href={`${prefix}/smart/launch`}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            使用測試環境重新啟動 / Relaunch (demo)
          </a>
        </div>
      </div>
    )
  }

  return <p className="p-6 text-sm text-muted-foreground">正在完成 SMART 登入… / Completing SMART login…</p>
}
