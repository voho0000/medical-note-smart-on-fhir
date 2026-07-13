"use client"
import { useCallback, useEffect, useState } from "react"
import { buildSmartAuthorizeConfig } from "@/src/infrastructure/fhir/client/smart-launch-config"

// Trusted SMART `iss` origins — launches against these authorize immediately.
// Anything else shows an explicit confirmation naming the target server first:
// `iss` comes straight off the URL, so anyone can craft a link that points
// this app's REAL domain at an attacker-controlled FHIR server (its
// .well-known/smart-configuration then redirects the clinician to a phishing
// "login" page, and afterwards the app would faithfully render attacker-
// authored FHIR data as a real chart). The interstitial keeps arbitrary
// sandboxes usable (one click) while making the target server impossible to
// miss. Extra trusted origins can be added at build time via
// NEXT_PUBLIC_SMART_ALLOWED_ISS (comma-separated origins).
const TRUSTED_ISS_ORIGINS = new Set(
  [
    "https://launch.smarthealthit.org",
    "http://localhost",
    "http://127.0.0.1",
    ...(process.env.NEXT_PUBLIC_SMART_ALLOWED_ISS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ].map((origin) => origin.replace(/\/+$/, "")),
)

function isTrustedIss(iss: string): boolean {
  try {
    const url = new URL(iss)
    if (TRUSTED_ISS_ORIGINS.has(url.origin)) return true
    // localhost entries match any port (mock-his:5001, bridge dev servers).
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      TRUSTED_ISS_ORIGINS.has(`${url.protocol}//${url.hostname}`)
    )
  } catch {
    return false
  }
}

async function authorize(iss: string, launch: string | undefined) {
  const FHIR = (await import("fhirclient")).default

  // Base path is injected at build time (NEXT_PUBLIC_BASE_PATH): "" in dev,
  // "/medical-note-smart-on-fhir" on GH Pages, "/app" on the mediprisma.tw
  // mirror — so redirectUri matches wherever this bundle is served.
  const prefix = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "")
  const baseUrl = `${window.location.origin}${prefix}`.replace(/\/+$/, "")
  const redirectUri = `${baseUrl}/smart/callback` // 無結尾斜線（和 Pages 設定一致）

  const authConfig = buildSmartAuthorizeConfig({
    clientId: (process.env.NEXT_PUBLIC_SMART_CLIENT_ID || "my_web_app").trim(),
    redirectUri,
    iss,
    launch,
  })

  // Public client + PKCE only. We deliberately do NOT support a
  // browser-side clientSecret: NEXT_PUBLIC_* is baked into the static
  // bundle, so it could never actually be confidential. (The old
  // confidential path existed only for an MOHW conformance sandbox.)
  // clientId stays configurable via NEXT_PUBLIC_SMART_CLIENT_ID — it is
  // a public identifier, not a secret.
  await FHIR.oauth2.authorize(authConfig)
}

export default function SmartLaunchPage() {
  // null = still resolving / auto-authorizing; a string = untrusted iss
  // awaiting the user's explicit confirmation.
  const [pendingIss, setPendingIss] = useState<string | null>(null)
  const [pendingLaunch, setPendingLaunch] = useState<string | undefined>(undefined)

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href)
      const iss = url.searchParams.get("iss") || undefined
      const launch = url.searchParams.get("launch") || undefined

      // 如果沒有參數，重定向到預設的完整 URL（方便評審直接使用）
      if (!iss && !launch) {
        const prefix = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "")
        const baseUrl = `${window.location.origin}${prefix}`.replace(/\/+$/, "")
        const defaultUrl = `${baseUrl}/smart/launch?iss=https%3A%2F%2Flaunch.smarthealthit.org%2Fv%2Fr4%2Ffhir&launch=WzAsIjJjZGE1YWFkLWU0MDktNDA3MC05YTE1LWUxYzM1YzQ2ZWQ1YSIsIjFlMzhiNzcxLWVhODctNDM0My1hNWE4LTYwMDIyMzc0Y2JhYSIsIlByYWN0aXRpb25lci81MjkxOTA5OS02YTdhLTQ0MmMtYjBkNS0yYjAyYzBkZDRiNzQiLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0`
        window.location.href = defaultUrl
        return
      }

      if (iss && !isTrustedIss(iss)) {
        setPendingIss(iss)
        setPendingLaunch(launch)
        return
      }

      await authorize(iss as string, launch)
    })()
  }, [])

  const confirmPending = useCallback(() => {
    if (!pendingIss) return
    const iss = pendingIss
    setPendingIss(null)
    void authorize(iss, pendingLaunch)
  }, [pendingIss, pendingLaunch])

  if (pendingIss) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm">
        <h1 className="mb-3 text-base font-semibold">確認 FHIR 伺服器 / Confirm FHIR server</h1>
        <p className="mb-2 text-muted-foreground">
          這個啟動連結指向一個不在信任清單上的 FHIR 伺服器。授權後，該伺服器的登入頁面將會開啟，
          且本應用會顯示該伺服器提供的病歷資料。請確認你信任這個位址再繼續。
        </p>
        <p className="mb-4 text-muted-foreground">
          This launch link points at a FHIR server that is not on the trusted list. If you continue,
          that server&apos;s login page will open and this app will display whatever clinical data it
          returns. Only continue if you recognise and trust this address.
        </p>
        <p className="mb-6 break-all rounded border bg-muted p-3 font-mono text-xs">{pendingIss}</p>
        <button
          type="button"
          onClick={confirmPending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          繼續連線 / Continue
        </button>
      </div>
    )
  }

  return <p className="p-6 text-sm text-muted-foreground">正在啟動 SMART… / Launching SMART…</p>
}
