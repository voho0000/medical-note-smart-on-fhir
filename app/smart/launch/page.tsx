// app/smart/launch/page.tsx
"use client"
import { useEffect } from "react"

export default function SmartLaunchPage() {
  useEffect(() => {
    (async () => {
      const FHIR = (await import("fhirclient")).default

      const url = new URL(window.location.href)
      const iss = url.searchParams.get("iss") || undefined
      const launch = url.searchParams.get("launch") || undefined

      const assetPrefix =
        ((window as any).__NEXT_DATA__?.assetPrefix as string | undefined) || ""
      const baseUrl = `${window.location.origin}${assetPrefix}`.replace(/\/+$/, "")

      const redirectUri = `${baseUrl}/smart/callback` // ← 無結尾斜線

      // 小工具：在瀏覽器 console 看看實際送出去的是什麼
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
