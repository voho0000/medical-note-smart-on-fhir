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
import { hasVisitMap } from '../renderers/visit/visit-model.source'

/**
 * `map` is the visit decision map, `sections` the three sections and `nhi`
 * the lipid Table 1 review — the layouts the switch offers. `flow` (新版流程)
 * and `board` (原版看板) are retired (clinician decision 2026-09-28: 「要淘汰
 * 了，暫時會只有三區塊跟決策地圖」), as `c` (direction C) was before them;
 * `classic` is the module-first table the other packs use. They stay in the
 * type and in the view so nothing that reads them breaks, and none is
 * offered in the switch. A browser that stored `c` reads as `sections`, one
 * that stored `flow` or `board` as no choice — the pack's default.
 */
export type CdssLayout = 'map' | 'sections' | 'flow' | 'nhi' | 'c' | 'board' | 'classic'

export const CDSS_LAYOUT_STORAGE_KEY = 'cdss-layout-preference'

/** The layouts the heart-failure switch offers. */
export const CDSS_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['map', 'sections']

/** Dyslipidemia has a dedicated Table 1 review instead of a second generic flow. */
export const LIPID_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['sections', 'nhi']

/** Layouts no longer offered: a stored one opens the pack's default instead. */
export const RETIRED_LAYOUTS: readonly CdssLayout[] = ['flow', 'board']

/** Atrial fibrillation: the decision map, or its own three-section visit flow. */
export const AF_SWITCHABLE_LAYOUTS: readonly CdssLayout[] = ['map', 'sections']

/**
 * What a pack opens on for a browser that never chose a layout: the decision
 * map where the pack declares one (`VISIT_MAPS` — heart failure and atrial
 * fibrillation today), else the three sections. A browser that did choose
 * keeps its choice: the stored layout wins over this.
 */
export function defaultLayoutFor(packId: string): CdssLayout {
  return hasVisitMap(packId) ? 'map' : 'sections'
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
        if (stored && RETIRED_LAYOUTS.includes(stored)) return { ...current, layout: null }
        return { ...current, layout: stored === 'c' ? 'sections' : stored ?? null }
      },
    },
  ),
)
