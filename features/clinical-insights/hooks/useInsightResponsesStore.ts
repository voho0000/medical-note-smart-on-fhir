// Module-level store for generated insight responses + per-panel status.
//
// Why a store and not component useState: the clinical-insights feature renders
// inside a Radix TabsContent in the right panel, which UNMOUNTS when the user
// switches to another tab. Local useState was therefore wiped every time the
// user left the tab and came back — the generated output vanished (very visible
// on phones, where you tab between data + insights constantly). A module-level
// store survives unmount/remount so the output persists.
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
  resetForPatient: (patientId: string | null | undefined) => void
}

export const useInsightResponsesStore = create<InsightResponsesState>((set) => ({
  responses: {},
  panelStatus: {},
  ownerPatientId: null,
  setResponses: (update) => set((s) => ({ responses: applyUpdate(s.responses, update) })),
  setPanelStatus: (update) => set((s) => ({ panelStatus: applyUpdate(s.panelStatus, update) })),
  resetForPatient: (patientId) =>
    set((s) => {
      // Ignore transient null/undefined (e.g. mid-reload) so we don't wipe on it.
      if (!patientId || s.ownerPatientId === patientId) return {}
      return { responses: {}, panelStatus: {}, ownerPatientId: patientId }
    }),
}))
