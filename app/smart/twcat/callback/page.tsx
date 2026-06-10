"use client"

// TWCAT-dedicated SMART callback.
//
// Why this exists (vs the existing /smart/callback):
//   The default /smart/callback redirects to "/" (the main app) on success.
//   For TWCAT vendor-verification we want to land back on /smart/twcat with
//   a flag so the picker can immediately read fhirclient state and prove
//   /Patient works. Living in its own folder also insulates this file from
//   edits to the main /smart/callback page.
//
// Daikon's `client-confidential-symmetric` accepts any redirect_uri (probed
// empirically — Keycloak client config uses a wildcard), so we can register
// this path with no admin involvement.

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  installParticipantTokenFetch,
  FlowLogStore,
} from "@/src/infrastructure/fhir/profiles/twcat-profile"

export default function TwcatSmartCallbackPage() {
  const router = useRouter()
  useEffect(() => {
    void (async () => {
      // Record that the browser arrived back here from the vendor's auth
      // server with the authorization code (or error). This sits between
      // entries [3] (navigate to /authorize) and [5] (code exchange POST).
      FlowLogStore.append({
        ts: Date.now(),
        label: "[4] Browser returned with ?code=… (Keycloak login complete)",
        method: "GET (browser navigation)",
        url: window.location.href,
        requestHeaders: { Accept: "text/html" },
      })
      // Wrapper handles X-Participant-Token injection for any FHIR call the
      // picker may issue after we land back. The /token POST itself goes to
      // Keycloak :10011 which doesn't gate on Participant Token, so order
      // here doesn't matter for the token exchange.
      installParticipantTokenFetch()
      try {
        const FHIR = (await import("fhirclient")).default
        await FHIR.oauth2.ready() // exchange code → token, store in sessionStorage
        const repoBase = "/medical-note-smart-on-fhir"
        const onRepoBase = window.location.pathname.startsWith(`${repoBase}/`)
        const prefix = onRepoBase ? repoBase : ""
        router.replace(`${prefix}/smart/twcat?launched=1`)
      } catch (e) {
        console.error("TWCAT SMART callback error", e)
        const msg = e instanceof Error ? e.message : String(e)
        const repoBase = "/medical-note-smart-on-fhir"
        const onRepoBase = window.location.pathname.startsWith(`${repoBase}/`)
        const prefix = onRepoBase ? repoBase : ""
        router.replace(
          `${prefix}/smart/twcat?launched=error&msg=${encodeURIComponent(msg)}`
        )
      }
    })()
  }, [router])

  return (
    <p className="p-6 text-sm text-muted-foreground">
      Completing TWCAT SMART login…
    </p>
  )
}
