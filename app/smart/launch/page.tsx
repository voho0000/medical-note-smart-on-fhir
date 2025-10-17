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

      await FHIR.oauth2.authorize({
        clientId: "my_web_app",
        scope: "launch openid fhirUser patient/*.read online_access",
        // 這裡改成帶結尾斜線
        redirectUri: `${baseUrl}/smart/callback/`.replace(/([^:]\/)\/+/g, "$1"),
        iss,
        launch,
        completeInTarget: true,
      })
    })()
  }, [])

  return <p className="p-6 text-sm text-muted-foreground">Launching SMART…</p>
}
