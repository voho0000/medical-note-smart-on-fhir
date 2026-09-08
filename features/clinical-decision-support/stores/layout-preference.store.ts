/**
 * Which face of the heart-failure guidance this browser shows.
 *
 * Both faces read the same pack result; only the placement differs. `board`
 * is the status board — today's sentences, the safety strip, the four
 * pillars, action-first rows. `classic` is the module-first table the other
 * packs use, with the clinical summary on top. The switch exists so pilot
 * users can compare the two on the same patient and tell us which one they
 * read; it is a per-browser preference, not a clinical fact, so it persists
 * in localStorage under its own key and never touches patient data.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CdssLayout = 'board' | 'classic'

export const CDSS_LAYOUT_STORAGE_KEY = 'cdss-layout-preference'

interface LayoutPreferenceState {
  layout: CdssLayout
  setLayout: (layout: CdssLayout) => void
}

export const useCdssLayoutStore = create<LayoutPreferenceState>()(
  persist(
    (set) => ({
      layout: 'board',
      setLayout: (layout) => set({ layout }),
    }),
    { name: CDSS_LAYOUT_STORAGE_KEY },
  ),
)
