'use client'

// Single answer to "are we on an unattended Medcloud launch route?".
//
// That route must be completely question-free: the Extension hands over a
// launch context, the patient data loads, and a summary runs with the model chosen
// independently by the site control. Anything that would stop and ask the user
// something — onboarding, tours, demographics — consults this and stays shut.
//
// Kept as a plain function rather than a hook so render-time gates can read it
// synchronously; every current caller runs it after hydration.

import { isMedcloudAutoLaunchUrl } from './medcloud-launch-context'

export function isMedcloudLaunchRoute(href?: string): boolean {
  const resolved = href ?? (typeof window === 'undefined' ? '' : window.location.href)
  if (!resolved) return false
  return isMedcloudAutoLaunchUrl(resolved)
}
