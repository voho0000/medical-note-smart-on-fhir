// Shared PREVENT manual inputs, encrypted per patient and browser session.
import { create } from 'zustand'
import {
  createHydrationGuard,
  discardEncryptedAnswers,
  hasEncryptedAnswers,
  loadEncryptedAnswers,
  persistEncryptedAnswers,
} from '@/src/application/services/encrypted-answer-cache.service'


export interface PreventInputEntry {
  
  value: string
  
  measuredOn?: string
  
  modifiedAt: string
}

export interface PreventInputs {
  
  entries: Readonly<Record<string, PreventInputEntry>>
}

export const EMPTY_PREVENT_INPUTS: PreventInputs = Object.freeze({ entries: Object.freeze({}) })


export type PreventInputsPatch = Readonly<Record<string, { value: string; measuredOn?: string } | null>>


export function mergePreventInputs(
  current: PreventInputs | undefined,
  patch: PreventInputsPatch,
  now: Date = new Date(),
): PreventInputs {
  const base = current ?? EMPTY_PREVENT_INPUTS
  const modifiedAt = now.toISOString()
  const entries: Record<string, PreventInputEntry> = { ...base.entries }
  let changed = false

  for (const [key, entry] of Object.entries(patch)) {
    if (entry === null || entry === undefined) {
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

const STORAGE_PREFIX = 'medical-calculator-prevent-inputs:'


export function preventInputsStorageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`
}


function toPreventInputs(parsed: unknown): PreventInputs {
  try {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_PREVENT_INPUTS
    const record = (parsed as Record<string, unknown>).entries
    if (!record || typeof record !== 'object') return EMPTY_PREVENT_INPUTS
    const entries: Record<string, PreventInputEntry> = {}
    for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const item = value as Record<string, unknown>
      if (typeof item.value !== 'string') continue
      entries[key] = {
        value: item.value,
        ...(typeof item.measuredOn === 'string' ? { measuredOn: item.measuredOn } : {}),
        modifiedAt: typeof item.modifiedAt === 'string' ? item.modifiedAt : '',
      }
    }
    return { entries }
  } catch {
    return EMPTY_PREVENT_INPUTS
  }
}

function writeStored(patientId: string, inputs: PreventInputs): void {
  const key = preventInputsStorageKey(patientId)
  if (Object.keys(inputs.entries).length === 0) {
    discardEncryptedAnswers(key)
    return
  }
  persistEncryptedAnswers(key, inputs)
}

const hydration = createHydrationGuard()

interface PreventInputsState {
  byPatientId: Readonly<Record<string, PreventInputs>>
  
  hydratedPatientIds: Readonly<Record<string, true>>
  
  hydrate: (patientId: string) => void
  setInputs: (patientId: string, patch: PreventInputsPatch, now?: Date) => void
  clearInputs: (patientId: string) => void
}

export const usePreventInputsStore = create<PreventInputsState>()((set, get) => ({
  byPatientId: {},
  hydratedPatientIds: {},

  hydrate: (patientId) => {
    if (!patientId) return
    const state = get()
    if (state.hydratedPatientIds[patientId] || hydration.isPending(patientId)) return
    if (state.byPatientId[patientId] || !hasEncryptedAnswers(preventInputsStorageKey(patientId))) {
      set((current) => ({
        byPatientId: current.byPatientId[patientId]
          ? current.byPatientId
          : { ...current.byPatientId, [patientId]: EMPTY_PREVENT_INPUTS },
        hydratedPatientIds: { ...current.hydratedPatientIds, [patientId]: true },
      }))
      return
    }

    const settle = hydration.begin(patientId)
    const apply = (inputs: PreventInputs) => {
      if (!settle()) return
      set((current) => ({
        byPatientId: current.byPatientId[patientId]
          ? current.byPatientId
          : { ...current.byPatientId, [patientId]: inputs },
        hydratedPatientIds: { ...current.hydratedPatientIds, [patientId]: true },
      }))
    }
    void loadEncryptedAnswers<unknown>(preventInputsStorageKey(patientId))
      .then((stored) => apply(toPreventInputs(stored)))
      .catch(() => apply(EMPTY_PREVENT_INPUTS))
  },

  setInputs: (patientId, patch, now = new Date()) => {
    if (!patientId) return
    set((state) => {
      const current = state.byPatientId[patientId]
      const next = mergePreventInputs(current, patch, now)
      if (next === current || next === EMPTY_PREVENT_INPUTS) return state
      writeStored(patientId, next)
      return { byPatientId: { ...state.byPatientId, [patientId]: next } }
    })
  },

  clearInputs: (patientId) => {
    if (!patientId) return
    discardEncryptedAnswers(preventInputsStorageKey(patientId))
    set((state) => ({
      byPatientId: { ...state.byPatientId, [patientId]: EMPTY_PREVENT_INPUTS },
      hydratedPatientIds: { ...state.hydratedPatientIds, [patientId]: true },
    }))
  },
}))


export function usePreventInputs(patientId: string | undefined): PreventInputs | undefined {
  return usePreventInputsStore((state) => (patientId ? state.byPatientId[patientId] : undefined))
}


export function usePreventInputsHydrated(patientId: string | undefined): boolean {
  return usePreventInputsStore(
    (state) => !patientId || Boolean(state.hydratedPatientIds[patientId]),
  )
}


export function buildPreventInputs(patch: PreventInputsPatch, now: Date = new Date()): PreventInputs {
  return mergePreventInputs(EMPTY_PREVENT_INPUTS, patch, now)
}
