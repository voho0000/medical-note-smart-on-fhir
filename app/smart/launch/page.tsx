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

      // 如果沒有參數，重定向到預設的完整 URL（方便評審直接使用）
      if (!iss && !launch) {
        const defaultUrl = `${baseUrl}/smart/launch?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Ffhir&launch=WzAsIjJjZGE1YWFkLWU0MDktNDA3MC05YTE1LWUxYzM1YzQ2ZWQ1YSIsIjFlMzhiNzcxLWVhODctNDM0My1hNWE4LTYwMDIyMzc0Y2JhYSIsIlByYWN0aXRpb25lci81MjkxOTA5OS02YTdhLTQ0MmMtYjBkNS0yYjAyYzBkZDRiNzQiLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0`
        window.location.href = defaultUrl
        return
      }

      const authConfig: any = {
        clientId: process.env.NEXT_PUBLIC_SMART_CLIENT_ID || "my_web_app",
        scope: "launch openid fhirUser patient/*.read online_access",
        redirectUri,
        iss,
        launch,
        completeInTarget: true,
      }

      // Only add clientSecret if provided (for confidential client mode)
      if (process.env.NEXT_PUBLIC_SMART_CLIENT_SECRET) {
        authConfig.clientSecret = process.env.NEXT_PUBLIC_SMART_CLIENT_SECRET
      }

      await FHIR.oauth2.authorize(authConfig)
    })()
  }, [])

  return <p className="p-6 text-sm text-muted-foreground">Launching SMART…</p>
}
