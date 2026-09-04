/**
 * Which evidence rows this physician has switched on or off, per patient.
 *
 * A row's `defaultEnabled` is what the record can say for itself. Whether that
 * row belongs in today's reading is a clinical judgement — only the physician
 * knows that last month's chest film was taken during a pneumonia — so the
 * decision lives in the host, never in the pack, and is handed back to the pack
 * as `CdssPatientProfile.evidenceOverrides` so the module recomputes from it.
 * Nothing here patches a rendered card.
 *
 * The state is keyed by patient because it is a statement about one person's
 * chart: carrying a switch from the previous patient into the next one would be
 * a wrong reading presented as a considered one. Persistence follows the same
 * rule — one localStorage key per patient — so clearing one patient never
 * touches another.
 */
import { create } from 'zustand'

export type EvidenceOverrideMap = Readonly<Record<string, boolean>>

const STORAGE_PREFIX = 'cdss-evidence-overrides:'

/** The localStorage key one patient's switches are kept under. */
export function evidenceOverridesStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}

/**
 * Storage is a best-effort cache, never a source of clinical truth: Safari
 * private mode throws on write, a quota can be full, and a hand-edited value
 * can be anything at all. Every path therefore degrades to "no overrides",
 * which is the same reading the pack gives on a first visit.
 */
function readStoredOverrides(patientId: string): EvidenceOverrideMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(evidenceOverridesStorageKey(patientId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function writeStoredOverrides(patientId: string, overrides: EvidenceOverrideMap): void {
  if (typeof window === 'undefined') return
  const key = evidenceOverridesStorageKey(patientId)
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify(overrides))
  } catch {
    // A switch that cannot be persisted still holds for this session.
  }
}

interface EvidenceOverridesState {
  byPatientId: Readonly<Record<string, EvidenceOverrideMap>>
  /** Loads one patient's stored switches once; a no-op after that. */
  hydrate: (patientId: string) => void
  setOverride: (patientId: string, itemId: string, enabled: boolean) => void
  clearOverrides: (patientId: string) => void
}

export const useEvidenceOverridesStore = create<EvidenceOverridesState>()((set, get) => ({
  byPatientId: {},

  hydrate: (patientId) => {
    if (!patientId) return
    if (get().byPatientId[patientId]) return
    const stored = readStoredOverrides(patientId)
    set((state) => (
      state.byPatientId[patientId]
        ? state
        : { byPatientId: { ...state.byPatientId, [patientId]: stored } }
    ))
  },

  setOverride: (patientId, itemId, enabled) => {
    if (!patientId || !itemId) return
    set((state) => {
      const current = state.byPatientId[patientId] ?? readStoredOverrides(patientId)
      const next: EvidenceOverrideMap = { ...current, [itemId]: enabled }
      writeStoredOverrides(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  clearOverrides: (patientId) => {
    if (!patientId) return
    writeStoredOverrides(patientId, {})
    set((state) => ({ byPatientId: { ...state.byPatientId, [patientId]: {} } }))
  },
}))

const EMPTY_OVERRIDES: EvidenceOverrideMap = Object.freeze({})

/**
 * One patient's switches, referentially stable between changes.
 *
 * The profile memo in `LiveFeature` uses this object as a dependency, so a new
 * literal on every render would rebuild the whole adapter on unrelated renders.
 */
export function useEvidenceOverrides(patientId: string | undefined): EvidenceOverrideMap {
  return useEvidenceOverridesStore(
    (state) => (patientId ? state.byPatientId[patientId] : undefined) ?? EMPTY_OVERRIDES,
  )
}

/** Reads one patient's switches outside React (tests, imperative callers). */
export function getEvidenceOverrides(patientId: string): EvidenceOverrideMap {
  return useEvidenceOverridesStore.getState().byPatientId[patientId]
    ?? readStoredOverrides(patientId)
}
