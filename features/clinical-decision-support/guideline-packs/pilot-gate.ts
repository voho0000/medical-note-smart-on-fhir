/**
 * Host-side pilot gate for care packs.
 *
 * The package ships most packs with `enabled: false` — they are written, but
 * not released. Showing one to a single tester used to mean cutting a package
 * release, so the gate lives here instead: a URL switch
 * (`?pilotPacks=heart-failure-cdss,atrial-fibrillation-cdss`) writes the ids to
 * this browser, the composition root treats those packs as visible, and
 * everyone else keeps seeing only the enabled ones. `?pilotPacks=` clears it.
 *
 * Storage is per-browser and holds pack ids only — no patient data — so it is
 * plain localStorage rather than anything account-scoped.
 *
 * The unattended Medcloud launch is deliberately outside all of this: that
 * route must show zero extra UI, so a pilot id a tester left in this browser on
 * an earlier visit does not follow the clinician into the hand-off.
 */
import { isMedcloudLaunchRoute } from '@/src/application/launch/medcloud-launch-route'

export const PILOT_PACK_STORAGE_KEY = 'cdss-pilot-packs'

/** The URL parameter that turns pilot packs on for this browser. */
export const PILOT_PACK_URL_PARAM = 'pilotPacks'

function normalise(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const id of ids) {
    const trimmed = typeof id === 'string' ? id.trim() : ''
    if (trimmed) seen.add(trimmed)
  }
  return [...seen]
}

/**
 * The pilot pack ids stored in this browser. Storage accessor only: it does not
 * consider the Medcloud route, so the settings UI can show what is stored.
 */
export function readPilotPackIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PILOT_PACK_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalise(parsed as string[])
  } catch {
    // Storage unavailable or the entry is not the JSON array we wrote — an
    // opt-in debugging switch is never worth throwing over.
    return []
  }
}

/** Replaces the stored pilot pack ids. An empty list clears the entry. */
export function writePilotPackIds(ids: readonly string[]): void {
  if (typeof window === 'undefined') return
  const next = normalise(ids)
  try {
    if (next.length === 0) {
      window.localStorage.removeItem(PILOT_PACK_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(PILOT_PACK_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private-mode / quota failures leave the previous state standing.
  }
}

/**
 * Reads `?pilotPacks=` out of a location search string and persists it.
 *
 * Returns the ids now in effect: the parsed list when the parameter is present
 * (empty when it is `?pilotPacks=`), otherwise whatever was already stored.
 * On the Medcloud launch route it writes nothing and returns an empty list.
 */
export function applyPilotPackIdsFromUrl(search: string): string[] {
  if (isMedcloudLaunchRoute()) return []
  let raw: string | null = null
  try {
    raw = new URLSearchParams(search).get(PILOT_PACK_URL_PARAM)
  } catch {
    return readPilotPackIds()
  }
  if (raw === null) return readPilotPackIds()
  const ids = normalise(raw.split(','))
  writePilotPackIds(ids)
  return ids
}

/**
 * True when this pack is visible only because a tester turned it on here.
 * Always false on the Medcloud launch route.
 */
export function isPilotPack(id: string): boolean {
  if (isMedcloudLaunchRoute()) return false
  return readPilotPackIds().includes(id)
}
