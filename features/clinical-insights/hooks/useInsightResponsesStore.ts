// Module-level store for generated insight responses + per-panel status.
//
// Why a store and not component useState: custom modules render in Medical
// Summary while their manager opens in a portal. A module-level store keeps
// completed output stable across those view lifecycles and responsive layouts.
//
// Cross-patient safety: the responses are keyed by panel id, which are stable
// across patients, so we must clear them when the *patient* changes — but NOT
// on every remount. resetForPatient() tracks the owning patient id and only
// clears when it genuinely changes (ignoring transient null during loading).
import { create } from 'zustand'
import type { Dispatch, SetStateAction } from 'react'
import type { ResponseEntry, PanelStatus } from '../types'

function applyUpdate<T>(prev: T, update: SetStateAction<T>): T {
  return typeof update === 'function' ? (update as (p: T) => T)(prev) : update
}

interface InsightResponsesState {
  responses: Record<string, ResponseEntry>
  panelStatus: Record<string, PanelStatus>
  ownerPatientId: string | null
  setResponses: Dispatch<SetStateAction<Record<string, ResponseEntry>>>
  setPanelStatus: Dispatch<SetStateAction<Record<string, PanelStatus>>>
  /** Publish a completed generation batch in one Zustand update so several
   * custom-summary modules become visible together, never panel-by-panel. */
  completeBatch: (
    panelIds: string[],
    entries: Record<string, ResponseEntry>,
    errors: Record<string, Error>,
  ) => void
  resetForPatient: (patientId: string | null | undefined) => void
}

export const useInsightResponsesStore = create<InsightResponsesState>((set) => ({
  responses: {},
  panelStatus: {},
  ownerPatientId: null,
  setResponses: (update) => set((s) => ({ responses: applyUpdate(s.responses, update) })),
  setPanelStatus: (update) => set((s) => ({ panelStatus: applyUpdate(s.panelStatus, update) })),
  completeBatch: (panelIds, entries, errors) =>
    set((s) => {
      const panelStatus = { ...s.panelStatus }
      for (const panelId of panelIds) {
        panelStatus[panelId] = {
          isLoading: false,
          error: errors[panelId] ?? null,
        }
      }
      return {
        responses: { ...s.responses, ...entries },
        panelStatus,
      }
    }),
  resetForPatient: (patientId) =>
    set((s) => {
      // Ignore transient null/undefined (e.g. mid-reload) so we don't wipe on it.
      if (!patientId || s.ownerPatientId === patientId) return {}
      return { responses: {}, panelStatus: {}, ownerPatientId: patientId }
    }),
}))
