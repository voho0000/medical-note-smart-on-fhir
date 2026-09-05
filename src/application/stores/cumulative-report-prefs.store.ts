// Cumulative-report (累積報告) view preferences — layout mode, how many date
// rows each category shows by default, and the clinician's own category order.
//
// These are reading habits, not clinical state: a nephrologist wants 生化 first
// and a full year of rows, a GP wants the latest three. Persisting them per
// device (localStorage, like medical-summary-prefs) means the workspace opens
// the way the same person left it, without any server-side record — no PHI is
// involved, only view settings.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type CumulativeLayoutMode = 'tabs' | 'stacked'

/** 顯示範圍 options. The value domain lives with the store that persists it —
 *  application code may not import from features, and the pure range maths in
 *  features/clinical-summary/reports/utils/cumulative-range.utils.ts reads the
 *  type back from here. */
export type CumulativeRangeId =
  | 'latest1'
  | 'latest3'
  | 'months3'
  | 'months6'
  | 'year1'

export const CUMULATIVE_RANGE_IDS: CumulativeRangeId[] = [
  'latest1',
  'latest3',
  'months3',
  'months6',
  'year1',
]

export const DEFAULT_CUMULATIVE_RANGE: CumulativeRangeId = 'latest3'

const LAYOUT_MODES: CumulativeLayoutMode[] = ['tabs', 'stacked']

interface CumulativeReportPrefsStore {
  /** 直式 (stacked) is the default: every panel in one scroll beats hunting
   *  through twelve sub-tabs for the two or three a clinician actually reads. */
  layoutMode: CumulativeLayoutMode
  setLayoutMode: (mode: CumulativeLayoutMode) => void
  /** How many date rows each category shows before 「查看更多」. */
  range: CumulativeRangeId
  setRange: (range: CumulativeRangeId) => void
  /** Explicit category order (ids). `null` = follow the shipped default.
   *  Shared by both layout modes, so the tab strip and the stacked sections
   *  never disagree about where 微生物 sits. */
  categoryOrder: string[] | null
  setCategoryOrder: (order: string[]) => void
  resetCategoryOrder: () => void
}

export const useCumulativeReportPrefsStore = create<CumulativeReportPrefsStore>()(
  persist(
    (set) => ({
      layoutMode: 'stacked',
      setLayoutMode: (mode) => set({ layoutMode: mode }),
      range: DEFAULT_CUMULATIVE_RANGE,
      setRange: (range) => set({ range }),
      categoryOrder: null,
      setCategoryOrder: (order) => set({ categoryOrder: order }),
      resetCategoryOrder: () => set({ categoryOrder: null }),
    }),
    {
      name: 'cumulative-report-prefs',
      // A persisted value written by an older (or newer, or hand-edited) build
      // must never dead-end the view. Anything unrecognised falls back to the
      // shipped default; the category order is repaired at read time instead
      // (see resolveCumulativeCategoryOrder), because which categories exist
      // depends on the lab-category model, not on this store.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!LAYOUT_MODES.includes(state.layoutMode)) state.layoutMode = 'stacked'
        if (!CUMULATIVE_RANGE_IDS.includes(state.range)) state.range = DEFAULT_CUMULATIVE_RANGE
        if (state.categoryOrder !== null && !Array.isArray(state.categoryOrder)) {
          state.categoryOrder = null
        }
      },
    },
  ),
)
