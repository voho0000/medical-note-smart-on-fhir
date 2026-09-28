/**
 * Which face of the heart-failure guidance this browser shows.
 *
 * All layouts read the same pack result; only the placement differs. `flow` is
 * the visit flow — the step bar, what the record already holds, the questions
 * asked once each, today's actions with a decision on every row, and the
 * record-and-follow-up card. `board` is the status board that shipped first
 * (the strip, the pillars, action-first rows), which pilot users call 原版.
 * `sections` groups independent modules into diagnosis, treatment and prognosis.
 * The switch exists so pilot users can compare layouts on the same patient and
 * tell us which one they read; it is a per-browser preference, not a clinical
 * fact, so it persists in localStorage under its own key and never touches
 * patient data.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * `sections` is the default. `flow` is the visit flow; `board` is the status board.
 * `c` was direction C — the decision summary — and `classic` is the
 * module-first table the other packs use; both stay in the type and in the
 * view so nothing that reads them breaks, and neither is offered in the
 * switch. A browser that stored `c` reads as `sections`.
 */
export type CdssLayout = 'sections' | 'flow' | 'nhi' | 'c' | 'board' | 'classic'

export const CDSS_LAYOUT_STORAGE_KEY = 'cdss-layout-preference'

/** The layouts offered by the switch. */
export const CDSS_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['sections', 'flow', 'board']

/** Dyslipidemia has a dedicated Table 1 review instead of a second generic flow. */
export const LIPID_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['sections', 'nhi', 'board']

interface LayoutPreferenceState {
  layout: CdssLayout
  setLayout: (layout: CdssLayout) => void
}

export const useCdssLayoutStore = create<LayoutPreferenceState>()(
  persist(
    (set) => ({
      layout: 'sections',
      setLayout: (layout) => set({ layout }),
    }),
    {
      name: CDSS_LAYOUT_STORAGE_KEY,
      // A browser that stored the retired direction C opens on sections rather
      // than on a layout the switch can no longer take it back to.
      merge: (persisted, current) => {
        const stored = (persisted as Partial<LayoutPreferenceState> | undefined)?.layout
        return { ...current, layout: stored === 'c' || stored === undefined ? 'sections' : stored }
      },
    },
  ),
)
