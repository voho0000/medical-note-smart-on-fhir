/**
 * The echo numbers the clinician read off a report and typed in, per patient.
 *
 * 健保雲端 carries an echocardiography report as text, and the scanner reads
 * what the report happens to print. A report that gives 「E/e′ Lat 11」 and no
 * absolute e′, or one whose strain study was not done, leaves HFA-PEFF short of
 * parameters it needs — and a score short of parameters is a floor, which is
 * the one reading that can talk a clinician out of a diagnosis. So the values
 * can be completed by hand, and what was typed is kept.
 *
 * Only what the clinician changed is stored. An auto-filled value is not
 * written here: it is already in the report, it would go stale the day a newer
 * echo arrives, and 「你輸入」 must mean what it says.
 *
 * Kept in this browser, keyed by patient, like the rest of this feature's
 * answers. Nothing is written to the chart and nothing leaves the browser.
 */
import { create } from 'zustand'

/** One value the clinician typed, with the day it was measured and changed. */
export interface HfpefInputEntry {
  /** The calculator's own string value: a number, or a select's option id. */
  value: string
  /** The day the measurement was taken, as YYYY-MM-DD. */
  measuredOn?: string
  /** When this browser last recorded a change, as an ISO timestamp. */
  modifiedAt: string
}

export interface HfpefInputs {
  /** Keyed by the calculator input key (`lavi`, `septalE`, …). */
  entries: Readonly<Record<string, HfpefInputEntry>>
}

export const EMPTY_HFPEF_INPUTS: HfpefInputs = Object.freeze({ entries: Object.freeze({}) })

/**
 * A statement about some of the fields. `null` returns a field to 「沒填」,
 * which is not an entry of its own — the report's value stands again.
 */
export type HfpefInputsPatch = Readonly<Record<string, { value: string; measuredOn?: string } | null>>

/**
 * The record after a patch, or the record itself when nothing changed.
 *
 * Saving the same number again is not a new measurement, so 「最後修改」 dates
 * the change rather than the click — the same rule the visit answers keep.
 */
export function mergeHfpefInputs(
  current: HfpefInputs | undefined,
  patch: HfpefInputsPatch,
  now: Date = new Date(),
): HfpefInputs {
  const base = current ?? EMPTY_HFPEF_INPUTS
  const modifiedAt = now.toISOString()
  const entries: Record<string, HfpefInputEntry> = { ...base.entries }
  let changed = false

  for (const [key, entry] of Object.entries(patch)) {
    if (entry === null || entry === undefined || !entry.value.trim()) {
      if (entries[key]) {
        delete entries[key]
        changed = true
      }
      continue
    }
    const existing = entries[key]
    if (existing && existing.value === entry.value && existing.measuredOn === entry.measuredOn) {
      continue
    }
    entries[key] = {
      value: entry.value,
      ...(entry.measuredOn ? { measuredOn: entry.measuredOn } : {}),
      modifiedAt,
    }
    changed = true
  }

  return changed ? { entries } : base
}

const STORAGE_PREFIX = 'cdss-hfpef-inputs:'

/** The localStorage key one patient's typed echo values are kept under. */
export function hfpefInputsStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}

/**
 * Storage is a best-effort cache, never a source of clinical truth: a private
 * window throws on write, a quota can be full, and a hand-edited value can be
 * anything. Every path degrades to 「沒填」, which is a first visit's reading.
 */
function readStored(patientId: string): HfpefInputs {
  if (typeof window === 'undefined') return EMPTY_HFPEF_INPUTS
  try {
    const raw = window.localStorage.getItem(hfpefInputsStorageKey(patientId))
    if (!raw) return EMPTY_HFPEF_INPUTS
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_HFPEF_INPUTS
    const record = (parsed as Record<string, unknown>).entries
    if (!record || typeof record !== 'object') return EMPTY_HFPEF_INPUTS
    const entries: Record<string, HfpefInputEntry> = {}
    for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const item = value as Record<string, unknown>
      if (typeof item.value !== 'string' || !item.value.trim()) continue
      entries[key] = {
        value: item.value,
        ...(typeof item.measuredOn === 'string' ? { measuredOn: item.measuredOn } : {}),
        modifiedAt: typeof item.modifiedAt === 'string' ? item.modifiedAt : '',
      }
    }
    return { entries }
  } catch {
    return EMPTY_HFPEF_INPUTS
  }
}

function writeStored(patientId: string, inputs: HfpefInputs): void {
  if (typeof window === 'undefined') return
  const key = hfpefInputsStorageKey(patientId)
  try {
    if (Object.keys(inputs.entries).length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify(inputs))
  } catch {
    // A value that cannot be persisted still holds for this session.
  }
}

interface HfpefInputsState {
  byPatientId: Readonly<Record<string, HfpefInputs>>
  /** Reads one patient's stored values once; a no-op after that. */
  hydrate: (patientId: string) => void
  setInputs: (patientId: string, patch: HfpefInputsPatch, now?: Date) => void
  clearInputs: (patientId: string) => void
}

export const useHfpefInputsStore = create<HfpefInputsState>()((set, get) => ({
  byPatientId: {},

  hydrate: (patientId) => {
    if (!patientId || get().byPatientId[patientId]) return
    const stored = readStored(patientId)
    set((state) => (
      state.byPatientId[patientId]
        ? state
        : { byPatientId: { ...state.byPatientId, [patientId]: stored } }
    ))
  },

  setInputs: (patientId, patch, now = new Date()) => {
    if (!patientId) return
    set((state) => {
      const current = state.byPatientId[patientId] ?? readStored(patientId)
      const next = mergeHfpefInputs(current, patch, now)
      if (next === current && state.byPatientId[patientId]) return state
      writeStored(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  clearInputs: (patientId) => {
    if (!patientId) return
    writeStored(patientId, EMPTY_HFPEF_INPUTS)
    set((state) => ({
      byPatientId: { ...state.byPatientId, [patientId]: EMPTY_HFPEF_INPUTS },
    }))
  },
}))

/** One patient's typed values, referentially stable between changes. */
export function useHfpefInputs(patientId: string | undefined): HfpefInputs | undefined {
  return useHfpefInputsStore((state) => (patientId ? state.byPatientId[patientId] : undefined))
}

/** A record built from one statement, for a caller with no store. */
export function buildHfpefInputs(patch: HfpefInputsPatch, now: Date = new Date()): HfpefInputs {
  return mergeHfpefInputs(EMPTY_HFPEF_INPUTS, patch, now)
}
