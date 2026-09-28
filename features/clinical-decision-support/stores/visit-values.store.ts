/**
 * Whether the map's status line shows its clinical values. Folded by default:
 * clinicians read the labs before they open the CDSS, and each decision box
 * prints the values it read (clinician feedback 2026-09-28: 「user 都先看完
 * lab data 後才進來點 CDSS」). A per-browser convenience, not a clinical fact,
 * so it persists in localStorage under its own key and never touches patient
 * data.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const VISIT_VALUES_STORAGE_KEY = 'cdss-visit-values-open'

interface VisitValuesState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useVisitValuesStore = create<VisitValuesState>()(
  persist(
    (set) => ({
      open: false,
      setOpen: (open) => set({ open }),
    }),
    { name: VISIT_VALUES_STORAGE_KEY },
  ),
)
