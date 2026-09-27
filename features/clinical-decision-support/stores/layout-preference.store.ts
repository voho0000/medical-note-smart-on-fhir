/**
 * Which face of the guidance this browser shows.
 *
 * All layouts read the same pack result; only the placement differs. `map` is
 * the visit decision map — the status line, the every-visit questions, today's
 * decisions, and the three sections drawn as the map's three columns. `flow`
 * is the visit flow — the step bar, what the record already holds, the
 * questions asked once each, today's actions with a decision on every row, and
 * the record-and-follow-up card. `board` is the status board that shipped
 * first (the strip, the pillars, action-first rows), which pilot users call
 * 原版. `sections` groups independent modules into diagnosis, treatment and
 * prognosis. The switch exists so pilot users can compare layouts on the same
 * patient and tell us which one they read; it is a per-browser preference, not
 * a clinical fact, so it persists in localStorage under its own key and never
 * touches patient data.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * `map` is the visit decision map, `sections` the three sections, `flow` the
 * visit flow, `board` the status board and `nhi` the lipid Table 1 review.
 * `c` was direction C — the decision summary — and `classic` is the
 * module-first table the other packs use; both stay in the type and in the
 * view so nothing that reads them breaks, and neither is offered in the
 * switch. A browser that stored `c` reads as `sections`.
 */
export type CdssLayout = 'map' | 'sections' | 'flow' | 'nhi' | 'c' | 'board' | 'classic'

export const CDSS_LAYOUT_STORAGE_KEY = 'cdss-layout-preference'

/** The layouts the heart-failure switch offers. */
export const CDSS_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['map', 'sections', 'flow', 'board']

/** Dyslipidemia has a dedicated Table 1 review instead of a second generic flow. */
export const LIPID_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['sections', 'nhi', 'board']

/** Atrial fibrillation: the decision map, or its own three-section visit flow. */
export const AF_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['map', 'sections']

/** The packs whose pages open on the decision map when nothing was chosen. */
export const VISIT_MAP_PACK_IDS: readonly string[] = ['heart-failure-cdss', 'atrial-fibrillation-cdss']

/**
 * What a pack opens on for a browser that never chose a layout. A browser that
 * did choose keeps its choice: the stored layout wins over this.
 */
export function defaultLayoutFor(packId: string): CdssLayout {
  return VISIT_MAP_PACK_IDS.includes(packId) ? 'map' : 'sections'
}

interface LayoutPreferenceState {
  /** The layout this browser chose, or null when it never chose one. */
  layout: CdssLayout | null
  setLayout: (layout: CdssLayout) => void
}

export const useCdssLayoutStore = create<LayoutPreferenceState>()(
  persist(
    (set) => ({
      layout: null,
      setLayout: (layout) => set({ layout }),
    }),
    {
      name: CDSS_LAYOUT_STORAGE_KEY,
      // A browser that stored the retired direction C opens on sections rather
      // than on a layout the switch can no longer take it back to. A browser
      // that stored nothing has made no choice, and each pack's own default
      // applies — which is what lets the default move without overriding
      // anyone who picked a layout on purpose.
      merge: (persisted, current) => {
        const stored = (persisted as Partial<LayoutPreferenceState> | undefined)?.layout
        return { ...current, layout: stored === 'c' ? 'sections' : stored ?? null }
      },
    },
  ),
)
