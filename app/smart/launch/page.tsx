"use client"
import { useEffect } from "react"

export default function SmartLaunchPage() {
  useEffect(() => {
    (async () => {
      const FHIR = (await import("fhirclient")).default

      const url = new URL(window.location.href)
      const iss = url.searchParams.get("iss") || undefined
      const launch = url.searchParams.get("launch") || undefined

      // 🔒 最穩：直接看 pathname 是否在 repo 子路徑底下
      const repoBase = "/medical-note-smart-on-fhir"
      const onRepoBase = window.location.pathname.startsWith(`${repoBase}/`)
      const prefix = onRepoBase ? repoBase : "" // 本機(或根域名)為空字串

      const baseUrl = `${window.location.origin}${prefix}`.replace(/\/+$/, "")
      const redirectUri = `${baseUrl}/smart/callback` // 無結尾斜線（和 Pages 設定一致）

      console.log("[SMART] href=", window.location.href)
      console.log("[SMART] pathname=", window.location.pathname)
      console.log("[SMART] baseUrl=", baseUrl, "redirectUri=", redirectUri)

      await FHIR.oauth2.authorize({
        clientId: "my_web_app",
        scope: "launch openid fhirUser patient/*.read online_access",
        redirectUri,
        iss,
        launch,
        completeInTarget: true,
      })
    })()
  }, [])

  return <p className="p-6 text-sm text-muted-foreground">Launching SMART…</p>
}
