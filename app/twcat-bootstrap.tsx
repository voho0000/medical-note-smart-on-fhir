"use client"

// Installs the TWCAT fetch wrapper on every page load. Idempotent.
//
// Mounted in the root layout (vs. inside fhir-client.service) so it runs
// before ANY component code touches fetch — including pages like
// /smart/twcat that don't go through FhirClientService at all. The wrapper
// short-circuits for non-TWCAT URLs, so cost is ~one host check per fetch.

import { useEffect } from "react"
import { installParticipantTokenFetch } from "@/src/infrastructure/fhir/profiles/twcat-profile"

export function TwcatBootstrap() {
  useEffect(() => {
    installParticipantTokenFetch()
  }, [])
  return null
}
