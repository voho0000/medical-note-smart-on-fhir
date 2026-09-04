// Launch context for usage analytics: how this session got its patient data,
// and which hand-off marker brought it here.
//
// Extracted from auth.provider so the same two values can go out BOTH as
// user properties and as the `app_launch` event without duplicating the
// priority rules. Deliberately coarse — never the SMART `iss`, never the
// import id, never any part of the URL beyond the `?site=` marker.
'use client'

import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'
import { getLaunchWorkstation } from '@/src/application/launch/medcloud-launch-context'
import type { LaunchSite, LaunchSource } from '@/src/application/telemetry/usage-analytics'

/**
 * Priority mirrors the data-source rules: the unattended Medcloud route wins,
 * then a local bundle (demo vs imported), then a live SMART session.
 *
 * The data-source helpers are imported dynamically: a reporting label must not
 * put FHIR client / local-bundle internals into the module graph of the auth
 * provider, which every screen loads before any patient data exists.
 */
export const detectLaunchSource = async (): Promise<LaunchSource> => {
  try {
    if (isMedcloudLaunchRoute()) return 'medcloud2'
    const [dataSource, fhirClient] = await Promise.all([
      import('@/src/application/hooks/ai-generation/ai-data-source'),
      import('@/src/infrastructure/fhir/client/fhir-client.service'),
    ])
    if (dataSource.isDemoDataActive()) return 'demo'
    if (dataSource.getAiDataSourceState().importId) return 'import'
    if (fhirClient.hasSmartContext()) return 'smart'
  } catch {
    // Storage unavailable — report the session rather than nothing.
  }
  return 'none'
}

/** The `?site=` hand-off marker only. */
export const detectSite = (): LaunchSite => {
  if (typeof window === 'undefined') return 'unknown'
  try {
    return new URL(window.location.href).searchParams.get('site') === 'vghtpe'
      ? 'vghtpe'
      : 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * The workstation / clinic-room code the launcher put in `?ws=`.
 *
 * Sourced only from the launch URL, never sniffed from the browser: it says
 * WHERE the app was opened, and the launch parser has already enforced the
 * shape (a malformed code invalidates the whole URL, so it arrives here as a
 * plain absence rather than as junk).
 */
export const detectWorkstation = (): string => {
  if (typeof window === 'undefined') return 'unknown'
  try {
    return getLaunchWorkstation(window.location.href) ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
