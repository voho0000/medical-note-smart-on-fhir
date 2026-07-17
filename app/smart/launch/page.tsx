"use client"
import { useCallback, useEffect, useState } from "react"
import { buildSmartAuthorizeConfig } from "@/src/infrastructure/fhir/client/smart-launch-config"
import { DEPLOYMENT_CONFIG } from '@/src/shared/config/deployment-profile.config'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import { CLOUD_SMART_CONFIG } from '@/src/shared/config/cloud-smart.config'
import { isTrustedSmartIssuer } from '@/src/shared/config/smart-issuer-policy'

// In cloud builds an untrusted SMART `iss` shows an explicit confirmation.
// In on-prem builds it is rejected: a confirmation click must never widen the
// build-time hospital issuer allowlist. `iss` comes straight off the URL, so
// anyone can craft a link that points this app's REAL domain at an
// attacker-controlled FHIR server (its
// .well-known/smart-configuration then redirects the clinician to a phishing
// "login" page, and afterwards the app would faithfully render attacker-
// authored FHIR data as a real chart). The cloud interstitial keeps arbitrary
// sandboxes usable while making the target impossible to miss. Extra trusted
// origins can be added at build time via
// NEXT_PUBLIC_SMART_ALLOWED_ISS (comma-separated origins).

async function authorize(iss: string, launch: string | undefined) {
  const FHIR = (await import("fhirclient")).default

  // Base path is injected at build time (NEXT_PUBLIC_BASE_PATH): "" in dev,
  // "/medical-note-smart-on-fhir" on GH Pages, "/app" on the mediprisma.tw
  // mirror — so redirectUri matches wherever this bundle is served.
  const prefix = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "")
  const baseUrl = `${window.location.origin}${prefix}`.replace(/\/+$/, "")
  const redirectUri = `${baseUrl}/smart/callback` // 無結尾斜線（和 Pages 設定一致）

  const authConfig = buildSmartAuthorizeConfig({
    clientId: ENV_CONFIG.smartClientId,
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
  const [launchError, setLaunchError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href)
      const iss = url.searchParams.get("iss") || undefined
      const launch = url.searchParams.get("launch") || undefined

      // Cloud keeps the convenient public demo. An on-prem artifact must be
      // launched by the hospital EHR and never invent a public issuer.
      if (!iss && !launch) {
        if (DEPLOYMENT_CONFIG.isOnPrem) {
          setLaunchError('缺少院內 SMART issuer（iss）。請從院內 EHR 重新啟動應用程式。')
          return
        }
        const prefix = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "")
        const baseUrl = `${window.location.origin}${prefix}`.replace(/\/+$/, "")
        const defaultUrl = `${baseUrl}/smart/launch${CLOUD_SMART_CONFIG.demoLaunchSearch}`
        window.location.href = defaultUrl
        return
      }

      if (!iss) {
        setLaunchError('SMART launch 缺少必要的 issuer（iss）。')
        return
      }

      if (!isTrustedSmartIssuer(iss)) {
        if (DEPLOYMENT_CONFIG.isOnPrem) {
          setLaunchError(`此 FHIR issuer 不在院內允許清單：${iss}`)
          return
        }
        setPendingIss(iss)
        setPendingLaunch(launch)
        return
      }

      await authorize(iss, launch)
    })().catch((error) => {
      setLaunchError(error instanceof Error ? error.message : String(error))
    })
  }, [])

  const confirmPending = useCallback(() => {
    if (!pendingIss) return
    const iss = pendingIss
    setPendingIss(null)
    void authorize(iss, pendingLaunch)
  }, [pendingIss, pendingLaunch])

  if (launchError) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm">
        <h1 className="mb-3 text-base font-semibold text-destructive">
          SMART 啟動已拒絕 / SMART launch blocked
        </h1>
        <p className="mb-4 text-muted-foreground">
          此部署只允許管理員設定的院內 FHIR issuer。請從院內 EHR 重新啟動應用程式，或聯絡系統管理員檢查 allowlist。
        </p>
        <p className="break-all rounded border bg-muted p-3 font-mono text-xs">{launchError}</p>
      </div>
    )
  }

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
