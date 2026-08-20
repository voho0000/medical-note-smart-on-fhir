'use client'

// Single answer to "are we on the unattended VGH-TPE Medcloud launch route?".
//
// That route must be completely question-free: the Extension hands over a
// credential, the patient data loads, and the tvghbrain summary runs. Anything
// that would stop and ask the user something — onboarding, the guided-tour
// offer, a background demographics prompt — has to consult this and stay shut.
//
// Kept as a plain function rather than a hook so render-time gates can read it
// synchronously; every current caller runs it after hydration.

import { isVghtpeMedcloudLaunchUrl } from './medcloud-launch-context'

export function isMedcloudLaunchRoute(href?: string): boolean {
  const resolved = href ?? (typeof window === 'undefined' ? '' : window.location.href)
  if (!resolved) return false
  return isVghtpeMedcloudLaunchUrl(resolved)
}
