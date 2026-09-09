/**
 * What the physician decided about a module, per patient.
 *
 * Pressing 「已開立 SGLT2i」 is a clinician's act, not something a rule can
 * derive, so the state lives here and is handed back to the pack as
 * `CdssPatientProfile.physicianDecisions`; the card then recomputes with the
 * option's own outcome as its status. Nothing patches a rendered row, and
 * nothing is written to the chart: a decision is evidence the physician
 * entered, exactly like a clinic blood pressure.
 *
 * Keyed by patient, and persisted the same way the evidence switches are —
 * one localStorage key per patient — because a decision recorded on one chart
 * must never follow the clinician into the next one.
 */
import { create } from 'zustand'
import type { PhysicianDecision } from '../types'

export type PhysicianDecisionMap = Readonly<Record<string, PhysicianDecision>>

const STORAGE_PREFIX = 'cdss-physician-decisions:'

export function physicianDecisionsStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}

function isDecision(value: unknown): value is PhysicianDecision {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.option === 'string'
    && typeof candidate.recordedAt === 'string'
    && (candidate.note === undefined || typeof candidate.note === 'string')
}

/**
 * Storage is a cache, never a source of clinical truth: a private window
 * throws on write, a quota can be full, and a hand-edited value can be
 * anything. Every path degrades to "no decisions", which is the reading the
 * pack gives on a first visit.
 */
function readStored(patientId: string): PhysicianDecisionMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(physicianDecisionsStorageKey(patientId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, PhysicianDecision] => isDecision(entry[1]))
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function writeStored(patientId: string, decisions: PhysicianDecisionMap): void {
  if (typeof window === 'undefined') return
  const key = physicianDecisionsStorageKey(patientId)
  try {
    if (Object.keys(decisions).length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify(decisions))
  } catch {
    // A decision that cannot be persisted still holds for this session.
  }
}

interface PhysicianDecisionsState {
  byPatientId: Readonly<Record<string, PhysicianDecisionMap>>
  /** Loads one patient's stored decisions once; a no-op after that. */
  hydrate: (patientId: string) => void
  record: (patientId: string, moduleId: string, decision: PhysicianDecision) => void
  withdraw: (patientId: string, moduleId: string) => void
  clear: (patientId: string) => void
}

export const usePhysicianDecisionsStore = create<PhysicianDecisionsState>()((set, get) => ({
  byPatientId: {},

  hydrate: (patientId) => {
    if (!patientId) return
    if (get().byPatientId[patientId]) return
    const stored = readStored(patientId)
    set((state) => (
      state.byPatientId[patientId]
        ? state
        : { byPatientId: { ...state.byPatientId, [patientId]: stored } }
    ))
  },

  record: (patientId, moduleId, decision) => {
    if (!patientId || !moduleId) return
    set((state) => {
      const current = state.byPatientId[patientId] ?? readStored(patientId)
      const next: PhysicianDecisionMap = { ...current, [moduleId]: decision }
      writeStored(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  withdraw: (patientId, moduleId) => {
    if (!patientId || !moduleId) return
    set((state) => {
      const current = state.byPatientId[patientId] ?? readStored(patientId)
      if (!(moduleId in current)) return state
      const next = { ...current }
      delete next[moduleId]
      writeStored(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  clear: (patientId) => {
    if (!patientId) return
    writeStored(patientId, {})
    set((state) => ({ byPatientId: { ...state.byPatientId, [patientId]: {} } }))
  },
}))

const EMPTY_DECISIONS: PhysicianDecisionMap = Object.freeze({})

/**
 * One patient's decisions, referentially stable between changes: the profile
 * memo in `LiveFeature` uses this object as a dependency, and a new literal on
 * every render would rebuild the whole adapter on unrelated renders.
 */
export function usePhysicianDecisions(patientId: string | undefined): PhysicianDecisionMap {
  return usePhysicianDecisionsStore(
    (state) => (patientId ? state.byPatientId[patientId] : undefined) ?? EMPTY_DECISIONS,
  )
}

/** Reads one patient's decisions outside React (tests, imperative callers). */
export function getPhysicianDecisions(patientId: string): PhysicianDecisionMap {
  return usePhysicianDecisionsStore.getState().byPatientId[patientId] ?? readStored(patientId)
}
