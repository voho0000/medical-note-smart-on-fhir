// Cross-component vocabulary for the 總覽 tab.

export type OverviewSectionId = 'labs' | 'reports' | 'meds' | 'visits'

/**
 * Everything a section needs to know about the space it was given.
 *
 * In the stacked layout `bounded` is false: the page scrolls, so every row
 * renders. In the 2×2 layout the card must not scroll, so the section is told
 * the measured height of its content box and derives its own row budget with
 * `fitRows` — each section knows its own row height and how much of the box a
 * pivot header or a timeline takes. Rows beyond the budget are summarised by
 * the 「另 N 項」 line.
 */
export interface OverviewSectionFit {
  bounded: boolean
  /** Measured content-box height in px; undefined before the first measure. */
  availablePx?: number
}

export const OVERVIEW_SECTION_DOM_ID: Record<OverviewSectionId, string> = {
  labs: 'overview-section-labs',
  reports: 'overview-section-reports',
  meds: 'overview-section-meds',
  visits: 'overview-section-visits',
}

/**
 * Container width at which 總覽 switches from the stacked list to the 2×2
 * grid, measured on the OverviewCard root.
 */
export const OVERVIEW_WIDE_BREAKPOINT_PX = 960

/**
 * The same threshold expressed as a LEFT PANEL width, for the page shell's
 * initial split. Three things sit between the panel's width and the card's:
 * ClinicalTabContentFrame's `sm:px-4` (32px), the panel's own scrollbar while
 * the stacked layout is still the one rendering (~15px), and sub-pixel loss
 * from resolving a percentage width. Asking for exactly +32 lands the card at
 * 959.4px — one pixel short, stacked. The slack costs a couple of percent of
 * split width and removes the whole class of off-by-one. Keep in step with
 * OVERVIEW_WIDE_BREAKPOINT_PX.
 */
export const OVERVIEW_WIDE_PANEL_PX = OVERVIEW_WIDE_BREAKPOINT_PX + 56
