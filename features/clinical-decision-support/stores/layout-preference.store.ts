/**
 * Which face of the heart-failure guidance this browser shows.
 *
 * Both faces read the same pack result; only the placement differs. `flow` is
 * the visit flow — the step bar, what the record already holds, the questions
 * asked once each, today's actions with a decision on every row, and the
 * record-and-follow-up card. `board` is the status board that shipped first
 * (the strip, the pillars, action-first rows), which pilot users call 原版.
 * The switch exists so pilot users can compare the two on the same patient and
 * tell us which one they read; it is a per-browser preference, not a clinical
 * fact, so it persists in localStorage under its own key and never touches
 * patient data.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * `flow` is the visit flow and the default. `board` is the status board.
 * `c` was direction C — the decision summary — and `classic` is the
 * module-first table the other packs use; both stay in the type and in the
 * view so nothing that reads them breaks, and neither is offered in the
 * switch. A browser that stored `c` reads as `flow`, because the layout it
 * named is no longer one of the two faces on offer.
 */
export type CdssLayout = 'flow' | 'c' | 'board' | 'classic'

export const CDSS_LAYOUT_STORAGE_KEY = 'cdss-layout-preference'

/** The two faces the switch offers. */
export const CDSS_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['flow', 'board']

interface LayoutPreferenceState {
  layout: CdssLayout
  setLayout: (layout: CdssLayout) => void
}

export const useCdssLayoutStore = create<LayoutPreferenceState>()(
  persist(
    (set) => ({
      layout: 'flow',
      setLayout: (layout) => set({ layout }),
    }),
    {
      name: CDSS_LAYOUT_STORAGE_KEY,
      // A browser that stored the retired direction C opens on the flow rather
      // than on a layout the switch can no longer take it back to.
      merge: (persisted, current) => {
        const stored = (persisted as Partial<LayoutPreferenceState> | undefined)?.layout
        return { ...current, layout: stored === 'c' || stored === undefined ? 'flow' : stored }
      },
    },
  ),
)
