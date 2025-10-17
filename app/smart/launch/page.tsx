"use client"
import { useEffect } from "react"

export default function SmartLaunchPage() {
  useEffect(() => {
    (async () => {
      const FHIR = (await import("fhirclient")).default

      const url = new URL(window.location.href)
      const iss = url.searchParams.get("iss") || undefined
      const launch = url.searchParams.get("launch") || undefined

      // 🔧 堅固版 baseUrl 推導：
      // 1) 若在 github.io（專案頁），固定加上 repo 路徑
      // 2) 其他環境（localhost/自家域名）維持空字串
      const repoBase = "/medical-note-smart-on-fhir"
      const isGithubPages = window.location.hostname.endsWith("github.io")
      const prefix = isGithubPages ? repoBase : ""

      const baseUrl = `${window.location.origin}${prefix}`.replace(/\/+$/, "")
      const redirectUri = `${baseUrl}/smart/callback` // 無結尾斜線

      // Debug 一下實際送出的值
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
